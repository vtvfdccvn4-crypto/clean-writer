import type { CanonicalPageBreakGuide } from '../preview/live/LivePreviewRenderer';

export interface PageGuideSnapshot {
  readonly projectId: string;
  readonly documentPath: string;
  readonly markdown: string;
}

export interface PageGuideComputation {
  readonly status: 'rendered' | 'failed' | 'cancelled';
  readonly guides: readonly CanonicalPageBreakGuide[];
}

export interface PageGuideCoordinatorDependencies {
  getSnapshot(): PageGuideSnapshot | null;
  compute(snapshot: PageGuideSnapshot, signal: AbortSignal): Promise<PageGuideComputation>;
  isCurrent(snapshot: PageGuideSnapshot): boolean;
  apply(guides: readonly CanonicalPageBreakGuide[]): void;
}

/** Owns debounced, cancellable background page-guide work for one active document. */
export class PageGuideCoordinator {
  private readonly dependencies: PageGuideCoordinatorDependencies;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private revision = 0;

  constructor(dependencies: PageGuideCoordinatorDependencies) {
    this.dependencies = dependencies;
  }

  schedule(): void {
    const snapshot = this.dependencies.getSnapshot();
    if (!snapshot) return;

    this.revision += 1;
    this.abortController?.abort();
    this.abortController = null;
    if (this.timer) clearTimeout(this.timer);

    const requestRevision = this.revision;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(snapshot, requestRevision);
    }, 450);
  }

  /**
   * Runs one guide pass immediately.  The caller may use this during document
   * activation as a short synchronization barrier; the underlying pass is
   * still allowed to finish after the timeout and publish if it remains
   * current.
   */
  async refreshNow(timeoutMs = 2500): Promise<boolean> {
    const snapshot = this.dependencies.getSnapshot();
    if (!snapshot) return false;

    this.revision += 1;
    this.abortController?.abort();
    this.abortController = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const requestRevision = this.revision;
    const work = this.run(snapshot, requestRevision);
    if (timeoutMs <= 0) return work;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<boolean>(resolve => {
      timeout = setTimeout(() => resolve(false), timeoutMs);
    });
    const result = await Promise.race([work, deadline]);
    if (timeout) clearTimeout(timeout);
    return result;
  }

  clear(): void {
    this.revision += 1;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
    this.dependencies.apply([]);
  }

  dispose(): void {
    this.clear();
  }

  private async run(snapshot: PageGuideSnapshot, requestRevision: number): Promise<boolean> {
    const abortController = new AbortController();
    this.abortController = abortController;
    try {
      const result = await this.dependencies.compute(snapshot, abortController.signal);
      if (requestRevision !== this.revision
        || abortController.signal.aborted
        || !this.dependencies.isCurrent(snapshot)
        || result.status !== 'rendered') return false;

      // Empty background results are non-destructive. A completed paginator
      // can temporarily return no source anchor while Paged.js is settling;
      // clearing the last valid guides here makes them disappear after edits.
      if (result.guides.length === 0) return false;
      this.dependencies.apply(result.guides);
      return true;
    } catch (error) {
      if (!abortController.signal.aborted && requestRevision === this.revision) {
        console.warn('[PageGuideCoordinator] Background page-guide refresh failed.', error);
      }
      return false;
    } finally {
      if (this.abortController === abortController) this.abortController = null;
    }
  }
}
