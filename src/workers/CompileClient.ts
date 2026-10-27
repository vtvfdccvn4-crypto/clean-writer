import type { CompiledPreview } from '../compiler';
import { COMPILE_PROTOCOL_VERSION, wallClockMs, type CompileJob, type CompilePhaseTimings, type CompileWorkerRequest, type CompileWorkerResponse, type CompileWorkerTiming } from './compile-protocol';

/**
 * Main-thread side of the compile worker. It keeps at most one job per lane
 * current: a newer job supersedes the older one, whose result is dropped. A
 * superseded job that has been running for a while is abandoned by replacing the
 * worker, since a compile cannot be interrupted inside the worker. If the worker
 * crashes, or does not answer a job within `hungAfterMs`, its pending jobs run on
 * the main thread and the worker is replaced on the next edit. Repeated failures
 * switch the client to the main thread for the rest of the session.
 */

export interface WorkerLike {
  postMessage(message: CompileWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<CompileWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}

/**
 * How long a job may wait for the worker before the worker is treated as hung. It must be
 * well above the slowest measured compile (about 4.4 s cold at 2.2 M characters on the
 * tested machine) so that a slow but healthy compile is not replaced.
 */
export const DEFAULT_HUNG_AFTER_MS = 15_000;

export interface CompileClientOptions {
  readonly createWorker: () => WorkerLike;
  /** Runs a job on the main thread, with the page's real asset resolver. */
  readonly compileLocal: (job: CompileJob) => Promise<CompileOutcome>;
  /** Crashes and hangs tolerated before the session stops using the worker. */
  readonly maxCrashes?: number;
  readonly hungAfterMs?: number;
}

export interface CompileOutcome {
  readonly compiled: CompiledPreview;
  readonly cacheHit: boolean;
  readonly phases: CompilePhaseTimings;
  /** Worker-side and page-side times for a job the worker compiled. Absent for a page-side compile. */
  readonly timing?: CompileOutcomeTiming;
}

/** The page sends at `sentAt` and receives at `receivedAt`; the worker's own times are in between. */
export interface CompileOutcomeTiming extends CompileWorkerTiming {
  readonly sentAt: number;
  readonly receivedAt: number;
}

export interface CompileRequest {
  readonly lane: string;
  readonly markdown: string;
  readonly settings: CompileJob['settings'];
  readonly assets: CompileJob['assets'];
  readonly sourceLineOffset: number;
  readonly sourceSegments?: CompileJob['sourceSegments'];
}

interface PendingJob {
  readonly lane: string;
  readonly job: CompileJob;
  sentAt: number;
  readonly resolve: (outcome: CompileOutcome | null) => void;
  readonly reject: (error: unknown) => void;
  /** Fires if the worker has not answered this job in time. */
  watchdog?: ReturnType<typeof setTimeout>;
}

/** The lane the live preview compiles in: its results are kept only until the next edit replaces them. */
export const LIVE_LANE = 'live';

export class SupersededCompileError extends Error {
  constructor() {
    super('The preview compile was superseded by a newer edit.');
    this.name = 'AbortError';
  }
}

/** True for the errors a caller should stop on quietly: a cancelled or superseded compile. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class CompileClient {
  private readonly options: CompileClientOptions;
  private readonly maxCrashes: number;
  private readonly hungAfterMs: number;
  private worker: WorkerLike | null = null;
  private crashes = 0;
  private fallback = false;
  private readonly pending = new Map<string, PendingJob>();
  private readonly currentByLane = new Map<string, string>();

  constructor(options: CompileClientOptions) {
    this.options = options;
    this.maxCrashes = options.maxCrashes ?? 2;
    this.hungAfterMs = options.hungAfterMs ?? DEFAULT_HUNG_AFTER_MS;
  }

  /** True once the worker has been abandoned for the rest of the session. */
  get usesFallback(): boolean {
    return this.fallback;
  }

  /**
   * Compiles a document. Rejects with a SupersededCompileError if a newer job on
   * the same lane replaces this one, so callers can stop without reporting an error.
   */
  compile(request: CompileRequest): Promise<CompileOutcome> {
    const jobId = crypto.randomUUID();
    const job: CompileJob = {
      jobId,
      markdown: request.markdown,
      settings: request.settings,
      assets: request.assets,
      sourceLineOffset: request.sourceLineOffset,
      // Only the live lane replaces its result on every edit; other lanes keep a bounded history.
      retention: request.lane === LIVE_LANE ? 'current' : 'history',
      ...(request.sourceSegments ? { sourceSegments: request.sourceSegments } : {})
    };

    const supersededId = this.currentByLane.get(request.lane);
    this.currentByLane.set(request.lane, jobId);
    if (supersededId !== undefined) this.supersede(supersededId);

    if (this.fallback) return this.runLocal(request.lane, job);

    return new Promise<CompileOutcome>((resolve, reject) => {
      this.pending.set(jobId, { lane: request.lane, job, sentAt: wallClockMs(), resolve: outcome => (outcome ? resolve(outcome) : reject(new SupersededCompileError())), reject });
      this.post({ type: 'compile', protocol: COMPILE_PROTOCOL_VERSION, job }, jobId);
      this.armWatchdog(jobId);
    });
  }

  dispose(): void {
    for (const job of this.pending.values()) {
      clearTimeout(job.watchdog);
      job.resolve(null);
    }
    this.pending.clear();
    this.currentByLane.clear();
    this.terminateWorker();
  }

  private supersede(jobId: string): void {
    const job = this.take(jobId);
    if (!job) return;
    job.resolve(null);
    // A compile cannot be interrupted inside the worker, so a superseded job that has not answered
    // keeps the worker busy, and the newer job would wait behind it. When nothing else is pending,
    // the worker is replaced instead, and the newer job starts on the new worker. A cancel still goes
    // out when another lane's job is pending on this worker.
    if (this.pending.size === 0) this.terminateWorker();
    else this.post({ type: 'cancel', jobId }, undefined);
  }

  private async runLocal(lane: string, job: CompileJob): Promise<CompileOutcome> {
    const outcome = await this.options.compileLocal(job);
    if (this.currentByLane.get(lane) !== job.jobId) throw new SupersededCompileError();
    return outcome;
  }

  private post(message: CompileWorkerRequest, jobId: string | undefined): void {
    let worker: WorkerLike;
    try {
      worker = this.ensureWorker();
    } catch {
      // The browser cannot create a compile worker (for example, it has no module worker
      // support). Compile on the page instead, as for a crashed worker.
      this.abandonWorker();
      return;
    }
    try {
      worker.postMessage(message);
    } catch (error) {
      // Messages that cannot be cloned are the caller's fault, not the worker's.
      if (jobId !== undefined) {
        const job = this.take(jobId);
        job?.reject(new Error(`The preview could not be sent to the compile worker: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.options.createWorker();
    worker.onmessage = event => this.receive(event.data);
    worker.onerror = () => this.recover();
    worker.onmessageerror = () => this.recover();
    this.worker = worker;
    return worker;
  }

  private receive(message: CompileWorkerResponse): void {
    if (message.type === 'ready') {
      if (message.protocol !== COMPILE_PROTOCOL_VERSION) this.abandonWorker();
      return;
    }
    if (message.type === 'error' && message.jobId === '') {
      // The worker rejected the request format, so the page cannot use it.
      this.abandonWorker();
      return;
    }
    // A result for a superseded or cancelled job has no pending entry.
    const job = this.take(message.jobId);
    if (!job) return;
    if (message.type === 'result') {
      const timing: CompileOutcomeTiming = { ...message.timing, sentAt: job.sentAt, receivedAt: wallClockMs() };
      job.resolve({ compiled: message.compiled, cacheHit: message.cacheHit, phases: message.phases, timing });
    } else {
      job.reject(new Error(message.message));
    }
  }

  private armWatchdog(jobId: string): void {
    const job = this.pending.get(jobId);
    if (!job) return;
    job.watchdog = setTimeout(() => this.recover(), this.hungAfterMs);
  }

  /** Removes a job from the pending set and stops its watchdog. */
  private take(jobId: string): PendingJob | undefined {
    const job = this.pending.get(jobId);
    if (!job) return undefined;
    this.pending.delete(jobId);
    clearTimeout(job.watchdog);
    return job;
  }

  /**
   * The worker died or stopped answering. It is replaced on the next edit, and its pending
   * jobs run on the main thread so the preview still updates. Each recovery counts as a
   * crash, so a worker that keeps failing is dropped for the rest of the session.
   */
  private recover(): void {
    this.terminateWorker();
    this.crashes += 1;
    if (this.crashes > this.maxCrashes) this.fallback = true;
    this.runStrandedOnPage();
  }

  /** The worker speaks another protocol, so it is not used; its pending jobs run on the page. */
  private abandonWorker(): void {
    this.terminateWorker();
    this.fallback = true;
    this.runStrandedOnPage();
  }

  /** Jobs whose worker is gone run on the page, unless a newer job has replaced them. */
  private runStrandedOnPage(): void {
    const stranded = [...this.pending.entries()];
    this.pending.clear();
    for (const [jobId, job] of stranded) {
      clearTimeout(job.watchdog);
      if (this.currentByLane.get(job.lane) !== jobId) {
        job.resolve(null);
        continue;
      }
      this.options.compileLocal(job.job)
        .then(outcome => job.resolve(outcome), error => job.reject(error));
    }
  }

  private terminateWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
