import { createPdfArtifact } from './artifact';
import { estimatePaginationBudget, type PaginationBudgetOptions } from './budget';
import {
  FRAME_READY_MESSAGE,
  PDF_PIPELINE_PROTOCOL_VERSION,
  RENDER_PROGRESS_MESSAGE,
  RENDER_REQUEST_MESSAGE,
  RENDER_RESULT_MESSAGE,
  type PaginationDiagnostics,
  type PaginationOutcome,
  type PdfRenderJob,
  type PhaseTiming,
  type PipelineProgress,
  type RenderResultMessage
} from './contracts';

export interface IsolatedPaginationHostOptions {
  /** URL of a page whose entry module calls bootPdfRendererFrame(). */
  readonly frameUrl: string | URL;
  readonly frameStartupTimeoutMs?: number;
  readonly budget?: PaginationBudgetOptions;
  /** Cross-origin frames expose document content; they require explicit opt-in. */
  readonly allowCrossOriginFrame?: boolean;
  readonly onDiagnostic?: (outcome: PaginationOutcome) => void;
}

/** Owns one disposable iframe per pagination request. */
export class IsolatedPaginationHost {
  readonly #options: IsolatedPaginationHostOptions;

  constructor(options: IsolatedPaginationHostOptions) {
    this.#options = options;
  }

  async requestArtifact(
    input: PdfRenderJob,
    onProgress?: (progress: PipelineProgress) => void,
    signal?: AbortSignal
  ): Promise<PaginationOutcome> {
    const requestId = crypto.randomUUID();
    const budget = estimatePaginationBudget(input, this.#options.budget);
    const startedAt = performance.now();
    const timings: PhaseTiming[] = [];
    const diagnostics = (pageCount?: number): PaginationDiagnostics => Object.freeze({
      requestId,
      budget,
      elapsedMs: Math.round(performance.now() - startedAt),
      ...(pageCount === undefined ? {} : { pageCount }),
      timings: Object.freeze([...timings])
    });
    const complete = (outcome: PaginationOutcome): PaginationOutcome => {
      this.#options.onDiagnostic?.(outcome);
      return outcome;
    };

    if (signal?.aborted) return complete({ status: 'cancelled', diagnostics: diagnostics() });

    let frame: HTMLIFrameElement | undefined;
    try {
      const frameUrl = new URL(this.#options.frameUrl, window.location.href);
      if (!this.#options.allowCrossOriginFrame && frameUrl.origin !== window.location.origin) {
        throw new Error('Cross-origin PDF renderer frames require allowCrossOriginFrame: true.');
      }
      frame = createFrame(frameUrl);
      const loadStartedAt = performance.now();
      report(onProgress, requestId, 'load-frame', budget, startedAt);
      await waitForFrameReady(frame, frameUrl.origin, this.#options.frameStartupTimeoutMs ?? 15_000, signal);
      timings.push({ phase: 'load-frame', durationMs: Math.round(performance.now() - loadStartedAt) });

      const responseStartedAt = performance.now();
      const response = await requestFrame(frame, frameUrl.origin, requestId, input, budget.timeoutMs, budget, startedAt, onProgress, signal);
      if (response.error) return complete({ status: 'failed', message: response.error, diagnostics: diagnostics() });
      if (!response.artifact) return complete({ status: 'failed', message: 'PDF renderer returned no artifact.', diagnostics: diagnostics() });

      const responseMs = Math.round(performance.now() - responseStartedAt);
      const paginationMs = Math.min(responseMs, Math.max(0, response.paginationMs));
      timings.push({ phase: 'paginate', durationMs: paginationMs });
      timings.push({ phase: 'transfer-artifact', durationMs: Math.max(0, responseMs - paginationMs) });
      const artifact = createPdfArtifact(response.artifact);
      if (artifact.renderId !== input.renderId) throw new Error('PDF renderer returned an artifact for a different render job.');
      return complete({ status: 'success', artifact, diagnostics: diagnostics(artifact.pageCount) });
    } catch (error) {
      if (isAbortError(error)) return complete({ status: 'cancelled', diagnostics: diagnostics() });
      if (error instanceof PaginationTimeoutError) {
        return complete({ status: 'timed-out', message: error.message, diagnostics: diagnostics() });
      }
      return complete({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        diagnostics: diagnostics()
      });
    } finally {
      frame?.remove();
    }
  }
}

class PaginationTimeoutError extends Error {}

function createFrame(url: URL): HTMLIFrameElement {
  if (!document.body) throw new Error('PDF pagination requires document.body to exist.');
  const frame = document.createElement('iframe');
  frame.src = url.toString();
  frame.title = 'Isolated PDF renderer';
  frame.setAttribute('aria-hidden', 'true');
  // Keep a normal viewport and avoid visibility:hidden, which can throttle RAF.
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1024px;height:768px;border:0;opacity:0;pointer-events:none;';
  return frame;
}

function waitForFrameReady(
  frame: HTMLIFrameElement,
  targetOrigin: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
      frame.removeEventListener('error', frameError);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const timeout = window.setTimeout(
      () => finish(new PaginationTimeoutError('PDF renderer frame did not become ready.')),
      timeoutMs
    );
    const abort = () => finish(new DOMException('PDF pagination was cancelled.', 'AbortError'));
    const frameError = () => finish(new Error('PDF renderer frame failed to load.'));
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== targetOrigin || event.source !== frame.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as { type?: string; protocolVersion?: number };
      if (message.type === FRAME_READY_MESSAGE && message.protocolVersion === PDF_PIPELINE_PROTOCOL_VERSION) finish();
    };
    window.addEventListener('message', receive);
    frame.addEventListener('error', frameError, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    document.body.appendChild(frame);
  });
}

function requestFrame(
  frame: HTMLIFrameElement,
  targetOrigin: string,
  requestId: string,
  input: PdfRenderJob,
  timeoutMs: number,
  budget: ReturnType<typeof estimatePaginationBudget>,
  startedAt: number,
  onProgress?: (progress: PipelineProgress) => void,
  signal?: AbortSignal
): Promise<RenderResultMessage> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: RenderResultMessage) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(result!);
    };
    const timeout = window.setTimeout(
      () => finish(new PaginationTimeoutError('PDF pagination timed out.')),
      timeoutMs
    );
    const abort = () => finish(new DOMException('PDF pagination was cancelled.', 'AbortError'));
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== targetOrigin || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
      const message = event.data as {
        type?: string;
        protocolVersion?: number;
        requestId?: string;
        pagesCompleted?: number;
      };
      if (message.protocolVersion !== PDF_PIPELINE_PROTOCOL_VERSION || message.requestId !== requestId) return;
      if (message.type === RENDER_PROGRESS_MESSAGE && typeof message.pagesCompleted === 'number') {
        onProgress?.({
          type: RENDER_PROGRESS_MESSAGE,
          requestId,
          phase: 'paginate',
          pagesCompleted: message.pagesCompleted,
          estimatedPages: budget.estimatedPages,
          elapsedMs: Math.round(performance.now() - startedAt),
          timeoutMs
        });
      } else if (message.type === RENDER_RESULT_MESSAGE) {
        finish(undefined, event.data as RenderResultMessage);
      }
    };
    window.addEventListener('message', receive);
    signal?.addEventListener('abort', abort, { once: true });
    frame.contentWindow?.postMessage({
      type: RENDER_REQUEST_MESSAGE,
      protocolVersion: PDF_PIPELINE_PROTOCOL_VERSION,
      requestId,
      input
    }, targetOrigin);
  });
}

function report(
  callback: ((progress: PipelineProgress) => void) | undefined,
  requestId: string,
  phase: PipelineProgress['phase'],
  budget: ReturnType<typeof estimatePaginationBudget>,
  startedAt: number
): void {
  callback?.({
    type: RENDER_PROGRESS_MESSAGE,
    requestId,
    phase,
    estimatedPages: budget.estimatedPages,
    elapsedMs: Math.round(performance.now() - startedAt),
    timeoutMs: budget.timeoutMs
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
