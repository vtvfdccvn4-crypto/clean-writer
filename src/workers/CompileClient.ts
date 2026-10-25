import type { CompiledPreview } from '../compiler';
import { COMPILE_PROTOCOL_VERSION, type CompileJob, type CompilePhaseTimings, type CompileWorkerRequest, type CompileWorkerResponse } from './compile-protocol';

/**
 * Main-thread side of the compile worker. It keeps at most one job per lane
 * current: a newer job supersedes the older one, whose result is dropped. A
 * superseded job that has been running for a while is abandoned by replacing the
 * worker, since a compile cannot be interrupted inside the worker. If the worker
 * crashes, its pending jobs run on the main thread, and repeated crashes switch
 * the client to the main thread for the rest of the session.
 */

export interface WorkerLike {
  postMessage(message: CompileWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<CompileWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}

export interface CompileClientOptions {
  readonly createWorker: () => WorkerLike;
  /** Runs a job on the main thread, with the page's real asset resolver. */
  readonly compileLocal: (job: CompileJob) => Promise<CompileOutcome>;
  readonly maxCrashes?: number;
  readonly recycleAfterMs?: number;
}

export interface CompileOutcome {
  readonly compiled: CompiledPreview;
  readonly cacheHit: boolean;
  readonly phases: CompilePhaseTimings;
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
  readonly startedAt: number;
  readonly resolve: (outcome: CompileOutcome | null) => void;
  readonly reject: (error: unknown) => void;
}

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
  private readonly recycleAfterMs: number;
  private worker: WorkerLike | null = null;
  private crashes = 0;
  private fallback = false;
  private readonly pending = new Map<string, PendingJob>();
  private readonly currentByLane = new Map<string, string>();

  constructor(options: CompileClientOptions) {
    this.options = options;
    this.maxCrashes = options.maxCrashes ?? 2;
    this.recycleAfterMs = options.recycleAfterMs ?? 500;
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
      ...(request.sourceSegments ? { sourceSegments: request.sourceSegments } : {})
    };

    const supersededId = this.currentByLane.get(request.lane);
    this.currentByLane.set(request.lane, jobId);
    if (supersededId !== undefined) this.supersede(supersededId);

    if (this.fallback) return this.runLocal(request.lane, job);

    return new Promise<CompileOutcome>((resolve, reject) => {
      this.pending.set(jobId, { lane: request.lane, job, startedAt: performance.now(), resolve: outcome => (outcome ? resolve(outcome) : reject(new SupersededCompileError())), reject });
      this.post({ type: 'compile', protocol: COMPILE_PROTOCOL_VERSION, job }, jobId);
    });
  }

  dispose(): void {
    for (const job of this.pending.values()) job.resolve(null);
    this.pending.clear();
    this.currentByLane.clear();
    this.terminateWorker();
  }

  private supersede(jobId: string): void {
    const job = this.pending.get(jobId);
    if (!job) return;
    this.pending.delete(jobId);
    job.resolve(null);
    // A job that has run for a while would hold the worker for the whole new compile.
    const runningFor = performance.now() - job.startedAt;
    if (runningFor > this.recycleAfterMs && this.pending.size === 0) {
      this.terminateWorker();
    } else {
      this.post({ type: 'cancel', jobId }, undefined);
    }
  }

  private async runLocal(lane: string, job: CompileJob): Promise<CompileOutcome> {
    const outcome = await this.options.compileLocal(job);
    if (this.currentByLane.get(lane) !== job.jobId) throw new SupersededCompileError();
    return outcome;
  }

  private post(message: CompileWorkerRequest, jobId: string | undefined): void {
    try {
      this.ensureWorker().postMessage(message);
    } catch (error) {
      // Messages that cannot be cloned are the caller's fault, not the worker's.
      if (jobId !== undefined) {
        const job = this.pending.get(jobId);
        this.pending.delete(jobId);
        job?.reject(new Error(`The preview could not be sent to the compile worker: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.options.createWorker();
    worker.onmessage = event => this.receive(event.data);
    worker.onerror = () => this.crash();
    worker.onmessageerror = () => this.crash();
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
    const job = this.pending.get(message.jobId);
    // A result for a superseded or cancelled job has no pending entry.
    if (!job) return;
    this.pending.delete(message.jobId);
    if (message.type === 'result') {
      job.resolve({ compiled: message.compiled, cacheHit: message.cacheHit, phases: message.phases });
    } else {
      job.reject(new Error(message.message));
    }
  }

  /** The worker died. Its pending jobs run on the main thread so the preview still updates. */
  private crash(): void {
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
