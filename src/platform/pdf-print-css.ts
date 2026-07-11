import type { PageSetup } from '../types';

/** CSS used only by the isolated browser print document. */
export function buildPdfPrintCss(pageSetup: PageSetup): string {
  return `
    @page {
      size: ${pageSetup.paperWidth}mm ${pageSetup.paperHeight}mm;
      margin: 0;
    }

    html, body {
      width: auto !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
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

    .pagedjs_page {
      width: ${pageSetup.paperWidth}mm !important;
      height: ${pageSetup.paperHeight}mm !important;
      min-width: ${pageSetup.paperWidth}mm !important;
      min-height: ${pageSetup.paperHeight}mm !important;
      margin: 0 !important;
      border: 0 !important;
      box-shadow: none !important;
      break-after: page;
      page-break-after: always;
    }

    .pagedjs_sheet {
      width: ${pageSetup.paperWidth}mm !important;
      height: ${pageSetup.paperHeight}mm !important;
      min-width: ${pageSetup.paperWidth}mm !important;
      min-height: ${pageSetup.paperHeight}mm !important;
      max-width: ${pageSetup.paperWidth}mm !important;
      max-height: ${pageSetup.paperHeight}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      box-shadow: none !important;
    }

    .pagedjs_pagebox {
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      box-shadow: none !important;
    }

    .pagedjs_page:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    #clear-writer-pdf-document .preview-toolbar,
    #clear-writer-pdf-document .preview-scroll-container {
      display: contents !important;
    }

    /* Browser print headers and footers are controlled by the print dialog. */
    @media print {
      html, body {
        width: 100% !important;
        height: auto !important;
        min-width: 0 !important;
        min-height: 0 !important;
      }

      .pagedjs_pages {
        display: block !important;
        width: auto !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: visible !important;
      }

      .pagedjs_page {
        display: block !important;
        width: ${pageSetup.paperWidth}mm !important;
        height: ${pageSetup.paperHeight}mm !important;
        min-height: ${pageSetup.paperHeight}mm !important;
        max-height: ${pageSetup.paperHeight}mm !important;
        break-after: page !important;
        page-break-after: always !important;
        break-inside: avoid !important;
      }

      .pagedjs_sheet {
        width: ${pageSetup.paperWidth}mm !important;
        height: ${pageSetup.paperHeight}mm !important;
        min-height: ${pageSetup.paperHeight}mm !important;
        max-height: ${pageSetup.paperHeight}mm !important;
        overflow: hidden !important;
      }

      .pagedjs_pagebox {
        width: 100% !important;
        height: 100% !important;
      }
    }
  `;
}
