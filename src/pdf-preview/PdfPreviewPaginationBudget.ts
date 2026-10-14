import type { PdfPreviewJob, PdfPreviewPaginationBudget } from './contracts';

const PRINT_MIN_TIMEOUT_MS = 30_000;
const PRINT_MAX_TIMEOUT_MS = 300_000;

/** Estimates a safe, bounded PDF-preview budget without retaining document content. */
export function estimatePdfPreviewBudget(input: PdfPreviewJob): PdfPreviewPaginationBudget {
  const textCharacters = input.html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
  const imageCount = (input.html.match(/<img\b/gi) ?? []).length;
  const explicitPageBreaks = (input.html.match(/(?:print-page-break|page-break-before|data-page-break)/gi) ?? []).length;
  const estimatedPages = Math.max(1, explicitPageBreaks + 1, Math.ceil(textCharacters / 1_200) + Math.ceil(imageCount * 0.75));
  const baseMs = 15_000;
  const perPageMs = 650;
  const perImageMs = 1_000;
  const minimum = PRINT_MIN_TIMEOUT_MS;
  const maximum = PRINT_MAX_TIMEOUT_MS;
  const timeoutMs = Math.min(maximum, Math.max(minimum, baseMs + estimatedPages * perPageMs + imageCount * perImageMs));
  return { estimatedPages, imageCount, textCharacters, timeoutMs };
}
