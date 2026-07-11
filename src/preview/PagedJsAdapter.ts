import { Previewer } from 'pagedjs';

export interface PagedPreviewer {
  preview(...args: any[]): Promise<any> | any;
  chunker?: {
    pages?: Array<{ removeListeners?: () => void }>;
    q?: { tick?: (callback: FrameRequestCallback) => unknown };
  };
}

export type PagedPreviewerFactory = () => PagedPreviewer;

type InterceptedListener = {
  type: string;
  listener: any;
  options: any;
};

export class PagedJsAdapter {
  private readonly factory: PagedPreviewerFactory;
  private currentPreviewer: PagedPreviewer;
  private activeRenderPromise: Promise<any> | null = null;
  private interceptedListeners: InterceptedListener[] = [];
  private readonly unthrottledPagination: boolean;

  constructor(
    factory: PagedPreviewerFactory = () => new Previewer(),
    unthrottledPagination = false
  ) {
    this.factory = factory;
    this.unthrottledPagination = unthrottledPagination;
    this.currentPreviewer = this.constructPreviewer();
  }

  getPreviewer(): PagedPreviewer {
    return this.currentPreviewer;
  }

  getDebugState() {
    return {
      interceptedListenerCount: this.interceptedListeners.length,
      isRenderActive: this.activeRenderPromise !== null
    };
  }

  async prepareForRender(): Promise<void> {
    const active = this.activeRenderPromise;
    if (active) {
      await active.catch(() => undefined);
      if (this.activeRenderPromise === active) this.activeRenderPromise = null;
    }
    this.cleanInterceptedListeners();
  }

  beginPreview(source: HTMLElement, styles: string[], target: HTMLElement): PagedRenderSession {
    const previewer = this.constructPreviewer();
    this.currentPreviewer = previewer;
    const stopIntercepting = this.startIntercepting();
    let promise: Promise<any>;
    try {
      promise = Promise.resolve(previewer.preview(source, styles, target));
    } catch (error) {
      promise = Promise.reject(error);
    }
    this.activeRenderPromise = promise;
    return new PagedRenderSession(this, previewer, promise, stopIntercepting);
  }

  finishSession(session: PagedRenderSession, cleanupResources: () => void): void {
    session.stopIntercepting();

    if (!session.settled) {
      const pending = session.promise;
      if (session.timedOut && this.activeRenderPromise === pending) {
        this.activeRenderPromise = null;
      }
      pending.catch(() => undefined).finally(() => {
        cleanupResources();
        this.cleanInterceptedListeners();
        if (this.activeRenderPromise === pending) this.activeRenderPromise = null;
      });
      return;
    }

    cleanupResources();
    if (this.currentPreviewer === session.previewer
      && this.activeRenderPromise === session.promise) {
      this.activeRenderPromise = null;
    }
  }

  private constructPreviewer(): PagedPreviewer {
    const stopIntercepting = this.startIntercepting();
    try {
      const previewer = this.factory();
      if (this.unthrottledPagination && previewer.chunker?.q) {
        // Paged.js yields once per physical page through requestAnimationFrame.
        // Backgrounded browser views may receive those frames slowly, so use
        // a task yield there. Visible preview windows retain animation frames.
        previewer.chunker.q.tick = callback => window.setTimeout(
          () => callback(performance.now()),
          0
        );
      }
      return previewer;
    } finally {
      stopIntercepting();
    }
  }

  private startIntercepting(): () => void {
    const originalAdd = window.addEventListener;
    window.addEventListener = (type: string, listener: any, options?: any) => {
      if (type === 'resize') this.interceptedListeners.push({ type, listener, options });
      return originalAdd.call(window, type, listener, options);
    };
    return () => {
      window.addEventListener = originalAdd;
    };
  }

  private cleanInterceptedListeners(): void {
    for (const item of this.interceptedListeners) {
      try {
        window.removeEventListener(item.type, item.listener, item.options);
      } catch {
        // Third-party cleanup must not destabilize the next render.
      }
    }
    this.interceptedListeners = [];
  }
}

export class PagedRenderSession {
  readonly previewer: PagedPreviewer;
  readonly promise: Promise<any>;
  settled = false;
  timedOut = false;
  private readonly adapter: PagedJsAdapter;
  private readonly stopInterception: () => void;
  private timeoutId: number | null = null;

  constructor(
    adapter: PagedJsAdapter,
    previewer: PagedPreviewer,
    promise: Promise<any>,
    stopInterception: () => void
  ) {
    this.adapter = adapter;
    this.previewer = previewer;
    this.promise = promise;
    this.stopInterception = stopInterception;
    promise.then(
      () => { this.settled = true; },
      () => { this.settled = true; }
    );
  }

  async wait(timeoutMs: number): Promise<void> {
    const timeout = new Promise<never>((_, reject) => {
      this.timeoutId = window.setTimeout(() => {
        this.timedOut = true;
        reject(new Error(`Paged.js render timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      await Promise.race([this.promise, timeout]);
    } finally {
      if (this.timeoutId !== null) window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  retirePageListeners(): void {
    const pages = this.previewer.chunker?.pages;
    if (!Array.isArray(pages)) return;
    pages.forEach(page => page.removeListeners?.());
  }

  stopIntercepting(): void {
    this.stopInterception();
  }

  finish(cleanupResources: () => void): void {
    this.adapter.finishSession(this, cleanupResources);
  }
}
