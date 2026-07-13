import type { TableSetup, TableStyle } from '../../state';
export function generateTableCss(setup: TableSetup): string {
  const number = (value: number, fallback: number, max: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
  };

  const buildTableCss = (styleNumber: 1 | 2, config: TableStyle) => {
    const selector = `table[data-table-style="${styleNumber}"]`;
    return `
      .pagedjs_page_content ${selector} {
        width: 100%;
        margin: ${number(config.marginTop, 8, 200)}pt 0 ${number(config.marginBottom, 12, 200)}pt;
        border-collapse: collapse;
        border-spacing: 0;
        font-family: ${config.fontFamily} !important;
        font-size: ${number(config.fontSize, 10, 200)}pt !important;
        color: ${config.bodyTextColor};
        background: ${config.bodyBackground};
        break-inside: auto;
      }

      .pagedjs_page_content ${selector} th,
      .pagedjs_page_content ${selector} td {
        padding: ${number(config.cellPadding, 6, 50)}pt;
        border: ${number(config.borderWidth, 0.75, 10)}pt solid ${config.borderColor};
        vertical-align: top;
        line-height: 1.2;
      }

      .pagedjs_page_content ${selector} th:empty::before,
      .pagedjs_page_content ${selector} td:empty::before {
        content: "\\00a0";
        display: inline-block;
        min-height: 1.2em;
      }

      .pagedjs_page_content ${selector} thead th {
        color: ${config.headerTextColor};
        background: ${config.headerBackground};
        font-weight: ${config.headerBold ? '700' : '400'};
      }

      .pagedjs_page_content ${selector} tbody td {
        color: ${config.bodyTextColor};
        background: ${config.bodyBackground};
      }

      .pagedjs_page_content ${selector} tbody tr:nth-child(even) td {
        background: ${config.alternateRowColor};
      }

      .pagedjs_page_content ${selector} tr {
        break-inside: avoid;
      }
    `;
  };

  return `${buildTableCss(1, setup.table1)}${buildTableCss(2, setup.table2)}`;
}
