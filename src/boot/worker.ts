import { PreviewController } from '../preview';
import { state } from '../state';
import type { PaginationTransport, AssetResolver } from '../platform/types';

export function bootWorker(transport: PaginationTransport, assetResolver: AssetResolver) {
  document.body.classList.add('is-worker');
  document.body.innerHTML = '<div class="preview-pane" style="background:transparent;"><div id="paged-stage" class="paged-stage" style="background:transparent; padding:0;"></div></div>';
  const printStyles = document.createElement('style');
  printStyles.id = 'pdf-worker-print-styles';
  printStyles.setAttribute('data-clear-writer-print-style', '');
  document.head.appendChild(printStyles);
  const stage = document.getElementById('paged-stage')!;
  const previewController = new PreviewController(stage, assetResolver, { unthrottledPagination: true });

  transport.onExecutePagination(async (payload) => {
    const {
      requestId,
      html,
      pageSetup,
      typographySetup,
      listSetup,
      tableSetup,
      projectMetadata
    } = payload;
    
    if (projectMetadata) state.setProjectMetadata(projectMetadata);
    
    if (typographySetup) {
      previewController.applyTypographySetup(typographySetup);
    }
    if (listSetup) {
      previewController.applyListSetup(listSetup);
    }
    if (tableSetup) {
      previewController.applyTableSetup(tableSetup);
    }
    
    if (pageSetup) {
      previewController.applyPageSetup(pageSetup);
    }

    try {
      await previewController.forceRender(html);
      applyWorkerPrintStyles(printStyles, pageSetup);
      await waitForExportAssets(stage);
      const pageCount = stage.querySelectorAll('.pagedjs_page').length;
      if (pageCount === 0) throw new Error('Pagination produced no printable pages.');
      transport.sendPaginationResult({ requestId, ok: true, pageCount });
    } catch (e) {
      console.error('Worker pagination failed', e);
      transport.sendPaginationResult({
        requestId,
        ok: false,
        error: e instanceof Error ? e.message : 'PDF pagination failed.'
      });
    }
  });
}

function applyWorkerPrintStyles(style: HTMLStyleElement, pageSetup: any) {
  const paperWidth = positiveNumber(pageSetup?.paperWidth, 210);
  const paperHeight = positiveNumber(pageSetup?.paperHeight, 297);
  style.textContent = `
    @page {
      size: ${paperWidth}mm ${paperHeight}mm;
      margin: 0;
    }

    @media print {
      html,
      body {
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        background: #ffffff !important;
      }

      .pagedjs_pages {
        display: block !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
      }

      .pagedjs_page,
      .pagedjs_sheet {
        width: ${paperWidth}mm !important;
        height: ${paperHeight}mm !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
      }

      .pagedjs_page {
        page-break-after: auto !important;
        break-after: auto !important;
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
      }

      .pagedjs_pagebox {
        box-shadow: none !important;
      }
    }
  `;
}

function positiveNumber(val: any, fallback: number): number {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function waitForExportAssets(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  const promises = images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  });
  return Promise.all(promises).then(() => {});
}
