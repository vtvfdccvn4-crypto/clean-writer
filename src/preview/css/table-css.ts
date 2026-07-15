import type { TableSetup, TableStyle } from '../../state';
import { resolveTableStyle } from '../../styles/resolved-document-styles';
export function generateTableCss(setup: TableSetup): string {
  const content = ':is(.pagedjs_page_content, .paged-stage.is-live-preview)';
  const number = (value: number, fallback: number, max: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
  };

  const buildTableCss = (styleNumber: 1 | 2, input: TableStyle) => {
    const config = resolveTableStyle(input);
    const selector = `table[data-table-style="${styleNumber}"]`;
    return `
      ${content} ${selector} {
        width: 100%;
        margin: ${number(config.marginTop, 8, 200)}pt 0 ${number(config.marginBottom, 12, 200)}pt;
        border-collapse: collapse;
        border-spacing: 0;
        font-family: ${config.fontFamily} !important;
        font-size: ${number(config.fontSize, 10, 200)}pt !important;
        break-inside: auto;
      }

      ${content} ${selector} th,
      ${content} ${selector} td {
        padding: ${number(config.cellPadding, 6, 50)}pt;
        border: ${number(config.borderWidth, 0.75, 10)}pt solid ${config.borderColor};
        vertical-align: top;
        line-height: 1.2;
      }

      ${content} ${selector} th:empty::before,
      ${content} ${selector} td:empty::before {
        content: "\\00a0";
        display: inline-block;
        min-height: 1.2em;
      }

      ${content} ${selector} thead th {
        font-weight: ${config.headerBold ? '700' : '400'};
        color: ${config.headerTextColor};
        background: ${config.headerBackground};
      }

      ${content} ${selector} tbody td {
        color: ${config.bodyTextColor};
        background: ${config.bodyBackground};
      }

      ${content} ${selector} tbody tr:nth-child(even) td {
        background: ${config.alternateRowColor};
      }

      ${content} ${selector} tr {
        break-inside: avoid;
      }
    `;
  };

  return `${buildTableCss(1, setup.table1)}${buildTableCss(2, setup.table2)}`;
}
