import '../style.css';
import { PreviewController } from '../preview';
import type { AssetResolver } from '../platform/types';
import type { ListSetup, PageSetup, TableSetup, TypographySetup } from '../types';

type ExportRequest = {
  type: 'clear-writer-export-request';
  requestId: string;
  input: {
    html: string;
    pageSetup: PageSetup;
    typographySetup: TypographySetup;
    listSetup: ListSetup;
    tableSetup: TableSetup;
  };
};

const passthroughAssets: AssetResolver = {
  preloadImages: async () => undefined,
  resolveSync: path => path,
  release: () => undefined,
  releaseAll: () => undefined
};

export function bootExportPaginationFrame(): void {
  document.body.innerHTML = '<div id="paged-stage" class="paged-stage" style="width:100%;min-height:100%;padding:0"></div>';
  const stage = document.getElementById('paged-stage')!;
  const preview = new PreviewController(stage, passthroughAssets, { unthrottledPagination: true });

  window.addEventListener('message', async (event: MessageEvent<ExportRequest>) => {
    if (event.origin !== window.location.origin || event.data?.type !== 'clear-writer-export-request') return;
    const { requestId, input } = event.data;
    preview.applyTypographySetup(input.typographySetup);
    preview.applyListSetup(input.listSetup);
    preview.applyTableSetup(input.tableSetup);
    preview.applyPageSetup(input.pageSetup, false);
    const result = await preview.forceRender(input.html);
    window.parent.postMessage({
      type: 'clear-writer-export-result',
      requestId,
      status: result.status,
      html: stage.innerHTML,
      error: result.error?.message
    }, window.location.origin);
  });

  window.parent.postMessage({ type: 'clear-writer-export-ready' }, window.location.origin);
}
