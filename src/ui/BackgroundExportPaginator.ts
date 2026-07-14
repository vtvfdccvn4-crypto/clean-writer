import type { ListSetup, PageSetup, TableSetup, TypographySetup } from '../types';

export interface BackgroundPaginationInput {
  html: string;
  pageSetup: PageSetup;
  typographySetup: TypographySetup;
  listSetup: ListSetup;
  tableSetup: TableSetup;
  resolvedMarginImageSources?: Record<string, string>;
}

type FrameResult = {
  type: 'clear-writer-export-result';
  requestId: string;
  status: 'rendered' | 'degraded' | 'stale';
  html: string;
  error?: string;
};

/** Paginates in a separate document so Paged.js cannot affect the app preview. */
export class BackgroundExportPaginator {
  async paginate(input: BackgroundPaginationInput): Promise<FrameResult> {
    const requestId = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1024px;height:1px;border:0;visibility:hidden;pointer-events:none;';

    // The current page can be an embedded test fixture or another host route.
    // Resolve from this bundled module so both Vite development and a relative
    // production base load the application's entry document.
    const frameUrl = new URL(
      import.meta.env.DEV ? '../../index.html' : '../index.html',
      import.meta.url
    );
    frameUrl.searchParams.set('export-frame', 'true');
    frame.src = frameUrl.toString();

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('PDF export renderer did not load.'));
        }, 15_000);
        const cleanup = () => {
          window.clearTimeout(timeout);
          window.removeEventListener('message', receiveReady);
        };
        const receiveReady = (event: MessageEvent<{ type?: string }>) => {
          if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
          if (event.data?.type !== 'clear-writer-export-ready') return;
          cleanup();
          resolve();
        };
        window.addEventListener('message', receiveReady);
        frame.addEventListener('error', () => {
          cleanup();
          reject(new Error('PDF export renderer could not load.'));
        }, { once: true });
        document.body.appendChild(frame);
      });

      return await new Promise<FrameResult>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('PDF export pagination timed out.'));
        }, 30_000);
        const cleanup = () => {
          window.clearTimeout(timeout);
          window.removeEventListener('message', receiveResult);
        };
        const receiveResult = (event: MessageEvent<FrameResult>) => {
          if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
          if (event.data?.type !== 'clear-writer-export-result' || event.data.requestId !== requestId) return;
          cleanup();
          if (event.data.status === 'rendered') resolve(event.data);
          else reject(new Error(event.data.error ?? `PDF export pagination ${event.data.status}.`));
        };
        window.addEventListener('message', receiveResult);
        frame.contentWindow?.postMessage({ type: 'clear-writer-export-request', requestId, input }, window.location.origin);
      });
    } finally {
      frame.remove();
    }
  }
}
