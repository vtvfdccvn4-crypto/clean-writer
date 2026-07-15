import type { PageSetup } from '../types';

/**
 * CSS for printing an immutable Paged.js result.
 *
 * Pagination has already happened in the isolated export frame. Its generated
 * page, sheet, pagebox, content, and margin-box dimensions are therefore
 * authoritative. This stylesheet deliberately owns only the browser print
 * surface only; touching Paged.js internals here erases the
 * reserved margins and causes headers/footers to overlap document content.
 */
export function buildPdfPrintCss(pageSetup: PageSetup): string {
  return `
    @page {
      size: ${pageSetup.paperWidth}mm ${pageSetup.paperHeight}mm;
      margin: 0;
    }

    html,
    body {
      width: auto !important;
      height: auto !important;
      min-width: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
    }

    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    #clear-writer-pdf-document,
    .paged-stage,
    .pagedjs_pages {
      display: block !important;
      width: auto !important;
      min-width: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: none !important;
      gap: 0 !important;
    }

    /* Paged.js has already made every physical page. Do not add CSS page
       breaks here: a forced break after an already fixed-height page creates
       an additional blank physical page in Chromium's print compositor. */
    .pagedjs_page {
      margin: 0 !important;
    }

    #clear-writer-pdf-document .preview-toolbar,
    #clear-writer-pdf-document .preview-scroll-container {
      display: contents !important;
    }
  `;
}
