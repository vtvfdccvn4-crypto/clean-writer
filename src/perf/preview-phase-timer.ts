import type {
  PreviewDocumentMetadata,
  PreviewOperationId,
  PreviewOperationKind,
  PreviewOperationStatus,
  PreviewOperationTrigger,
  PreviewPhaseTiming,
  PreviewPageTiming,
  PreviewTimingPhase,
  PreviewTimingRecord
} from './preview-timing';

export interface PreviewPhaseTimerOptions {
  operationId?: PreviewOperationId;
  kind: PreviewOperationKind;
  trigger?: PreviewOperationTrigger;
  metadata?: PreviewDocumentMetadata;
  now?: () => number;
  wallClock?: () => number;
}

type ActivePhaseStarts = Map<PreviewTimingPhase, number[]>;

let operationSequence = 0;

/** Creates an operation ID without requiring UUID support in older browsers. */
export function createPreviewOperationId(): PreviewOperationId {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid) return randomUuid.call(globalThis.crypto);
  operationSequence += 1;
  return `preview-${Date.now()}-${operationSequence}`;
}

/**
 * Collects timings for one preview operation.
 *
 * A phase can be nested or started more than once; each start gets its own
 * stack entry. Unclosed phases are safely closed when the operation finishes,
 * which keeps failure and cancellation diagnostics useful.
 */
export class PreviewPhaseTimer {
  private readonly operationId: PreviewOperationId;
  private readonly kind: PreviewOperationKind;
  private readonly trigger?: PreviewOperationTrigger;
  private readonly metadata: PreviewDocumentMetadata;
  private readonly now: () => number;
  private readonly wallClock: () => number;
  private readonly startedAt: number;
  private readonly startedWallClock: number;
  private readonly active: ActivePhaseStarts = new Map();
  private readonly timings: PreviewPhaseTiming[] = [];
  private pageTimings: readonly PreviewPageTiming[] | undefined;
  private finishedRecord: PreviewTimingRecord | null = null;

  constructor(options: PreviewPhaseTimerOptions) {
    this.operationId = options.operationId ?? createPreviewOperationId();
    this.kind = options.kind;
    this.trigger = options.trigger;
    this.metadata = { ...options.metadata };
    this.now = options.now ?? (() => performance.now());
    this.wallClock = options.wallClock ?? (() => Date.now());
    this.startedAt = this.now();
    this.startedWallClock = this.wallClock();
  }

  get id(): PreviewOperationId {
    return this.operationId;
  }

  /** Starts a phase and returns an idempotent completion callback. */
  start(phase: PreviewTimingPhase): () => number {
    if (this.finishedRecord) return () => 0;
    const starts = this.active.get(phase) ?? [];
    starts.push(this.now());
    this.active.set(phase, starts);
    let ended = false;
    return () => {
      if (ended) return 0;
      ended = true;
      return this.end(phase);
    };
  }

  /** Completes the most recently started span for a phase. */
  end(phase: PreviewTimingPhase): number {
    if (this.finishedRecord) return 0;
    const starts = this.active.get(phase);
    const started = starts?.pop();
    if (started === undefined) return 0;
    if (starts?.length === 0) this.active.delete(phase);
    const durationMs = Math.max(0, this.now() - started);
    this.timings.push({ phase, durationMs });
    return durationMs;
  }

  /** Records a phase whose duration was measured by another subsystem. */
  record(phase: PreviewTimingPhase, durationMs: number): void {
    if (this.finishedRecord) return;
    this.timings.push({ phase, durationMs: Math.max(0, durationMs) });
  }

  updateMetadata(metadata: PreviewDocumentMetadata): void {
    if (this.finishedRecord) return;
    Object.assign(this.metadata, metadata);
  }

  setPageTimings(pageTimings: readonly PreviewPageTiming[]): void {
    if (this.finishedRecord) return;
    this.pageTimings = [...pageTimings];
  }

  finish(status: PreviewOperationStatus, options: { metadata?: PreviewDocumentMetadata; error?: unknown } = {}): PreviewTimingRecord {
    if (this.finishedRecord) return this.finishedRecord;
    const completedAt = this.now();

    // Capture unfinished work at the operation boundary instead of throwing.
    for (const [phase, starts] of this.active) {
      while (starts.length > 0) {
        const started = starts.pop()!;
        this.timings.push({ phase, durationMs: Math.max(0, completedAt - started) });
      }
    }
    this.active.clear();

    if (options.metadata) Object.assign(this.metadata, options.metadata);
    const totalDurationMs = Math.max(0, completedAt - this.startedAt);
    const phaseTimings = [...this.timings];
    phaseTimings.push({ phase: 'total', durationMs: totalDurationMs });
    const measurable = phaseTimings.filter(timing => timing.phase !== 'total');
    const slowest = measurable.reduce<PreviewPhaseTiming | undefined>(
      (current, timing) => !current || timing.durationMs > current.durationMs ? timing : current,
      undefined
    );
    const errorMessage = options.error === undefined
      ? undefined
      : options.error instanceof Error ? options.error.message : String(options.error);

    this.finishedRecord = {
      operationId: this.operationId,
      kind: this.kind,
      trigger: this.trigger,
      status,
      startedAt: this.startedWallClock,
      completedAt: this.wallClock(),
      totalDurationMs,
      metadata: { ...this.metadata },
      phases: phaseTimings,
      pageTimings: this.pageTimings,
      slowestPhase: slowest?.phase,
      errorMessage
    };
    return this.finishedRecord;
  }
}
