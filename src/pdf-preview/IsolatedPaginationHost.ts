import {
  PDF_PREVIEW_FRAME_READY,
  type PdfPreviewFrameMessage,
  type PdfPreviewFrameRequest,
  type PdfPreviewFrameResult,
  type PdfPreviewJob,
  type PdfPreviewPaginationBudget,
  type PdfPreviewPaginationDiagnostics,
  type PdfPreviewPaginationOutcome,
  type PdfPreviewPhaseTiming,
  type PdfPreviewProgress,
  type PdfPreviewRenderResult,
  type PdfPreviewWatchdogLimits
} from './contracts';
import { estimatePdfPreviewBudget } from './PdfPreviewPaginationBudget';
import { recordPdfPreviewDiagnostic } from './PdfPreviewDiagnosticsLog';
import { createPdfArtifact } from './PdfArtifact';

const FRAME_STARTUP_TIMEOUT_MS = 15_000;

type HostOptions = {
  signal?: AbortSignal;
  budget: PdfPreviewPaginationBudget;
  onProgress?: (progress: PdfPreviewProgress) => void;
  onPhase?: (phase:
    | 'load-pagination-frame'
    | 'frame-source-install'
    | 'frame-pagedjs-initialization'
    | 'frame-pagedjs-queue-cycle'
    | 'frame-pagination-css-extraction'
    | 'paginate'
    | 'frame-margin-materialization'
    | 'frame-margin-dom-write'
    | 'frame-artifact-serialization'
    | 'transfer-print-artifact', durationMs: number) => void;
};

/** Owns the isolated iframe lifecycle for every PDF-preview pagination job. */
export class IsolatedPaginationHost {
  private activeRequest: Promise<void> = Promise.resolve();
  private frame: HTMLIFrameElement | null = null;
  // Resolves when the warm frame has sent PDF_PREVIEW_FRAME_READY.
  // Rejects (and is cleared) if the frame fails to boot.
  private frameReady: Promise<void> | null = null;

  /**
   * @param limits Overrides the watchdog limits estimated from each job. Tests
   * use small values to exercise the stall and ceiling paths quickly.
   */
  private readonly limits: Partial<PdfPreviewWatchdogLimits>;

  constructor(limits: Partial<PdfPreviewWatchdogLimits> = {}) {
    this.limits = limits;
  }

  /** Boot the pagination frame early so the first preview request finds it warm. */
  prewarm(): void {
    this.ensureWarmFrame();
  }

  /** Remove the warm frame and release all resources. Call on project close. */
  dispose(): void {
    this.frame?.remove();
    this.frame = null;
    this.frameReady = null;
  }

  requestPrintArtifact(
    input: PdfPreviewJob,
    onProgress?: (progress: PdfPreviewProgress) => void,
    signal?: AbortSignal,
    onPhase?: HostOptions['onPhase']
  ): Promise<PdfPreviewPaginationOutcome<PdfPreviewRenderResult>> {
    const budget: PdfPreviewPaginationBudget = { ...estimatePdfPreviewBudget(input), ...this.limits };
    return this.run({ type: 'clear-writer-pdf-preview-request', requestId: crypto.randomUUID(), input }, {
      budget,
      onProgress,
      signal,
      onPhase
    });
  }

  private ensureWarmFrame(): { frame: HTMLIFrameElement; ready: Promise<void> } {
    if (this.frame && this.frameReady) {
      return { frame: this.frame, ready: this.frameReady };
    }
    const frame = this.createFrame();
    const ready = this.bootFrame(frame);
    // Auto-invalidate on boot failure so the next request gets a fresh frame.
    ready.catch(() => {
      if (this.frame === frame) this.invalidateFrame();
    });
    this.frame = frame;
    this.frameReady = ready;
    return { frame, ready };
  }

  private invalidateFrame(): void {
    this.frame?.remove();
    this.frame = null;
    this.frameReady = null;
  }

  private async run<T extends PdfPreviewFrameResult>(
    request: PdfPreviewFrameRequest,
    options: HostOptions
  ): Promise<PdfPreviewPaginationOutcome<T>> {
    const previousRequest = this.activeRequest;
    let releaseRequest!: () => void;
    let releaseAfterPrevious = false;
    this.activeRequest = new Promise(resolve => { releaseRequest = resolve; });
    const startedAt = performance.now();
    const timings: PdfPreviewPhaseTiming[] = [];
    const diagnostics = (): PdfPreviewPaginationDiagnostics => ({
      requestId: request.requestId,
      budget: options.budget,
      elapsedMs: Math.round(performance.now() - startedAt),
      timings
    });
    const complete = <R extends PdfPreviewPaginationOutcome<T>>(outcome: R): R => {
      if (outcome.status !== 'success') recordPdfPreviewDiagnostic(outcome);
      return outcome;
    };
    try {
    if (!await this.waitForPreviousRequest(previousRequest, options.signal)) {
      // Preserve this queue slot until its predecessor finishes. Releasing it
      // now would let a later request overlap the active paginator.
      releaseAfterPrevious = true;
      void previousRequest.then(releaseRequest, releaseRequest);
      return complete({ status: 'cancelled', diagnostics: diagnostics() });
    }
    if (options.signal?.aborted) return complete({ status: 'cancelled', diagnostics: diagnostics() });
      const { frame, ready } = this.ensureWarmFrame();
      try {
        const loadStartedAt = performance.now();
        options.onProgress?.(this.progress(request.requestId, 'load-pagination-frame', options.budget, startedAt));
        try {
          await this.awaitFrameReady(ready, options.signal);
        } finally {
          const loadDurationMs = Math.round(performance.now() - loadStartedAt);
          timings.push({ phase: 'load-pagination-frame', durationMs: loadDurationMs });
          options.onPhase?.('load-pagination-frame', loadDurationMs);
        }
        const paginationStartedAt = performance.now();
        const result = await this.request(frame, request, { ...options, startedAt }) as T;
        const responseElapsedMs = Math.round(performance.now() - paginationStartedAt);
        const paginationMs = Math.min(responseElapsedMs, result.paginationMs ?? responseElapsedMs);
        timings.push({ phase: 'paginate', durationMs: paginationMs });
        options.onPhase?.('paginate', paginationMs);
        if (request.type === 'clear-writer-pdf-preview-request') {
          const frameTimings = (result as PdfPreviewRenderResult).frameTimings;
          if (frameTimings) {
            options.onPhase?.('frame-source-install', frameTimings.sourceInstallMs);
            options.onPhase?.('frame-pagedjs-initialization', frameTimings.pagedJsInitializationMs);
            if (frameTimings.pagedJsQueueCycleMs !== undefined) {
              options.onPhase?.('frame-pagedjs-queue-cycle', frameTimings.pagedJsQueueCycleMs);
            }
            if (frameTimings.paginationCssExtractionMs !== undefined) {
              options.onPhase?.('frame-pagination-css-extraction', frameTimings.paginationCssExtractionMs);
            }
            if (frameTimings.marginMaterializationMs !== undefined) {
              options.onPhase?.('frame-margin-materialization', frameTimings.marginMaterializationMs);
            }
            if (frameTimings.marginDomWriteMs !== undefined) {
              options.onPhase?.('frame-margin-dom-write', frameTimings.marginDomWriteMs);
            }
            if (frameTimings.artifactSerializationMs !== undefined) {
              options.onPhase?.('frame-artifact-serialization', frameTimings.artifactSerializationMs);
            }
          }
        }
        const artifactTransferMs = Math.max(0, responseElapsedMs - paginationMs);
        timings.push({ phase: 'transfer-print-artifact', durationMs: artifactTransferMs });
        options.onPhase?.('transfer-print-artifact', artifactTransferMs);
        const finalDiagnostics = { ...diagnostics(), ...('artifact' in result ? { pageCount: result.artifact.pageCount } : {}) };
        if (result.error) {
          return complete({ status: 'failed', message: result.error, diagnostics: finalDiagnostics });
        }
        return complete({ status: 'success', result: this.freezeArtifactResult(result), diagnostics: finalDiagnostics });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // Discard the frame before the queue slot is released, so the next
          // job can never overlap a layout pass that is still running.
          // Always invalidate — even if the request was not yet posted, the
          // frame's state is untrustworthy once an abort fires.
          this.invalidateFrame();
          return complete({ status: 'cancelled', diagnostics: diagnostics() });
        }
        if (error instanceof PaginationTimeoutError) {
          // Frame timed out — discard it so the next request gets a fresh boot.
          this.invalidateFrame();
          return complete({ status: 'timed-out', message: (error as Error).message, diagnostics: diagnostics() });
        }
        // Unexpected error: frame state is unknown, discard it.
        this.invalidateFrame();
        throw error;
      }
    } finally {
      if (!releaseAfterPrevious) releaseRequest();
    }
  }

  /** Waits for serialized work while allowing a queued request to leave promptly. */
  private waitForPreviousRequest(previousRequest: Promise<void>, signal?: AbortSignal): Promise<boolean> {
    if (!signal) return previousRequest.then(() => true);
    if (signal.aborted) return Promise.resolve(false);

    return new Promise(resolve => {
      const finish = (completed: boolean) => {
        signal.removeEventListener('abort', abort);
        resolve(completed);
      };
      const abort = () => finish(false);
      previousRequest.then(() => finish(true), () => finish(true));
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  /** Race the shared frame-boot promise against a per-request abort signal. */
  private awaitFrameReady(ready: Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!signal) return ready;
    if (signal.aborted) return Promise.reject(new DOMException('PDF preview pagination was cancelled.', 'AbortError'));

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(new DOMException('PDF preview pagination was cancelled.', 'AbortError'));
      ready.then(() => finish(), err => finish(err instanceof Error ? err : new Error(String(err))));
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  private createFrame(): HTMLIFrameElement {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1024px;height:1px;border:0;visibility:hidden;pointer-events:none;';
    const frameUrl = new URL(import.meta.env.DEV ? '../../index.html' : '../index.html', import.meta.url);
    frameUrl.searchParams.set('pdf-preview', 'true');
    if (new URLSearchParams(window.location.search).get('preview-diagnostics') === 'true') {
      frameUrl.searchParams.set('timings', 'true');
    }
    frame.src = frameUrl.toString();
    return frame;
  }

  /** Attach frame to DOM and resolve when it signals ready. No per-request abort — boot is shared. */
  private bootFrame(frame: HTMLIFrameElement): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        window.removeEventListener('message', receiveReady);
        frame.removeEventListener('error', frameError);
        if (error) reject(error); else resolve();
      };
      const timeout = window.setTimeout(
        () => finish(new PaginationTimeoutError('PDF preview renderer did not load.')),
        FRAME_STARTUP_TIMEOUT_MS
      );
      const frameError = () => finish(new Error('PDF preview renderer could not load.'));
      const receiveReady = (event: MessageEvent<{ type?: string }>) => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type === PDF_PREVIEW_FRAME_READY) finish();
      };
      window.addEventListener('message', receiveReady);
      frame.addEventListener('error', frameError, { once: true });
      document.body.appendChild(frame);
    });
  }

  /**
   * Waits for the frame's result under a progress-aware watchdog. The stall
   * timer restarts each time the frame reports a newly completed page, so a long
   * job that keeps producing pages is not killed. The ceiling bounds the job
   * regardless of progress.
   *
   * Watchdog timers fire only when the parent's event loop runs. Paged.js yields
   * between pages, which is what lets this detect a stall; a frame that blocks
   * the shared main thread cannot be watched from here (plan E12).
   */
  private request(
    frame: HTMLIFrameElement,
    request: PdfPreviewFrameRequest,
    options: HostOptions & { startedAt: number }
  ): Promise<PdfPreviewFrameResult> {
    return new Promise((resolve, reject) => {
      let highestPageSeen = 0;
      let stallTimer: number | undefined;
      const finish = (error?: Error, result?: PdfPreviewFrameResult) => {
        window.clearTimeout(stallTimer);
        window.clearTimeout(ceilingTimer);
        window.removeEventListener('message', receive);
        options.signal?.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(result!);
      };
      const armStallTimer = () => {
        window.clearTimeout(stallTimer);
        stallTimer = window.setTimeout(() => finish(new PaginationTimeoutError(
          `PDF preview pagination stalled after ${highestPageSeen} pages.`
        )), options.budget.stallMs);
      };
      const ceilingTimer = window.setTimeout(() => finish(new PaginationTimeoutError(
        `PDF preview pagination exceeded its ${options.budget.ceilingMs} ms ceiling.`
      )), options.budget.ceilingMs);
      armStallTimer();
      const abort = () => finish(new DOMException('PDF preview pagination was cancelled.', 'AbortError'));
      const receive = (event: MessageEvent<PdfPreviewFrameMessage>) => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.requestId !== request.requestId) return;
        if (event.data.type === 'clear-writer-pdf-preview-progress') {
          const pagesCompleted = event.data.pagesCompleted ?? 0;
          if (pagesCompleted > highestPageSeen) {
            highestPageSeen = pagesCompleted;
            armStallTimer();
          }
          options.onProgress?.({
            ...event.data,
            estimatedPages: options.budget.estimatedPages,
            elapsedMs: Math.round(performance.now() - options.startedAt)
          });
          return;
        }
        if (event.data.type === 'clear-writer-pdf-preview-result' && request.type === 'clear-writer-pdf-preview-request') {
          finish(undefined, event.data);
          return;
        }
        if (event.data.type === 'clear-writer-pdf-preview-busy') {
          // The host serializes jobs, so a busy frame means the frame state is unknown.
          finish(new Error('PDF preview renderer was still busy with another job.'));
        }
      };
      window.addEventListener('message', receive);
      options.signal?.addEventListener('abort', abort, { once: true });
      frame.contentWindow?.postMessage(request, window.location.origin);
    });
  }

  private progress(
    requestId: string,
    phase: PdfPreviewProgress['phase'],
    budget: PdfPreviewPaginationBudget,
    startedAt: number
  ): PdfPreviewProgress {
    return {
      type: 'clear-writer-pdf-preview-progress', requestId, phase,
      estimatedPages: budget.estimatedPages,
      elapsedMs: Math.round(performance.now() - startedAt)
    };
  }

  /** Message transport clones objects, so re-freeze the artifact at the ownership boundary. */
  private freezeArtifactResult<T extends PdfPreviewFrameResult>(result: T): T {
    if (!('artifact' in result)) return result;
    return { ...result, artifact: createPdfArtifact(result.artifact) } as T;
  }
}

class PaginationTimeoutError extends Error {}
