import type { PdfPreviewJob, PdfPreviewPaginationBudget } from './contracts';

// Provisional values (docs/developer/large-document-plan.md §6). The stall limit
// bounds how long a job may run without completing one more physical page; the
// ceiling is a last-resort bound for a job that keeps making progress forever.
// Neither is calibrated against measured throughput yet (plan Phase 0, B1).
export const PRINT_STALL_MS = 60_000;
export const PRINT_STALL_WITH_IMAGES_MS = 120_000;
export const PRINT_CEILING_MS = 45 * 60_000;

/** Estimates the pagination size and watchdog limits without retaining document content. */
export function estimatePdfPreviewBudget(input: PdfPreviewJob): PdfPreviewPaginationBudget {
  const textCharacters = input.html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
  const imageCount = (input.html.match(/<img\b/gi) ?? []).length;
  const explicitPageBreaks = (input.html.match(/(?:print-page-break|page-break-before|data-page-break)/gi) ?? []).length;
  const estimatedPages = Math.max(1, explicitPageBreaks + 1, Math.ceil(textCharacters / 1_200) + Math.ceil(imageCount * 0.75));
  return {
    estimatedPages,
    imageCount,
    textCharacters,
    stallMs: imageCount > 0 ? PRINT_STALL_WITH_IMAGES_MS : PRINT_STALL_MS,
    ceilingMs: PRINT_CEILING_MS
  };
}
