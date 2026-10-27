import type { CompiledPreview, DocumentCompileSettings, PreviewCompilationPhase, PreviewSourceSegment } from '../compiler';

/**
 * Messages between the page and the compile worker. Every value is structured-
 * cloneable: strings, numbers, plain objects and arrays. The asset resolver is
 * replaced by the path-to-URL map that the page builds before posting.
 */

export const COMPILE_PROTOCOL_VERSION = 1 as const;

export interface CompileJob {
  readonly jobId: string;
  readonly markdown: string;
  readonly settings: DocumentCompileSettings;
  /** Image and icon sources the document uses, mapped to the URLs the page resolved. */
  readonly assets: Readonly<Record<string, string>>;
  readonly sourceLineOffset: number;
  readonly sourceSegments?: readonly PreviewSourceSegment[];
}

export type CompileWorkerRequest =
  | { readonly type: 'compile'; readonly protocol: typeof COMPILE_PROTOCOL_VERSION; readonly job: CompileJob }
  | { readonly type: 'cancel'; readonly jobId: string };

export type CompilePhaseTimings = Partial<Record<PreviewCompilationPhase, number>>;

/**
 * Worker-side times, in milliseconds since the Unix epoch (`wallClockMs`), so the page
 * can compare them with its own clock. They separate the request's transfer, the
 * compile, and the result's transfer.
 */
export interface CompileWorkerTiming {
  readonly workerReceivedAt: number;
  readonly workerCompiledAt: number;
  readonly workerPostedAt: number;
}

/** The time on the Unix epoch, to the sub-millisecond, as seen by this context. */
export const wallClockMs = (): number => performance.timeOrigin + performance.now();

export type CompileWorkerResponse =
  | { readonly type: 'ready'; readonly protocol: typeof COMPILE_PROTOCOL_VERSION }
  | { readonly type: 'result'; readonly jobId: string; readonly compiled: CompiledPreview; readonly cacheHit: boolean; readonly phases: CompilePhaseTimings; readonly timing: CompileWorkerTiming }
  | { readonly type: 'error'; readonly jobId: string; readonly message: string };
