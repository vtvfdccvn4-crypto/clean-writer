import type { PaginationBudget, PdfRenderJob } from './contracts';

export interface PaginationBudgetOptions {
  readonly minimumTimeoutMs?: number;
  readonly maximumTimeoutMs?: number;
  readonly baseTimeoutMs?: number;
  readonly timeoutPerPageMs?: number;
  readonly timeoutPerImageMs?: number;
  readonly charactersPerPage?: number;
}

export function estimatePaginationBudget(
  input: Pick<PdfRenderJob, 'html'>,
  options: PaginationBudgetOptions = {}
): PaginationBudget {
  const minimum = options.minimumTimeoutMs ?? 30_000;
  const maximum = options.maximumTimeoutMs ?? 300_000;
  if (minimum <= 0 || maximum < minimum) throw new Error('Invalid PDF pagination timeout bounds.');

  const textCharacters = input.html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:[a-zA-Z][a-zA-Z0-9]+|#[0-9]+|#x[a-fA-F0-9]+);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
  const imageCount = (input.html.match(/<img\b/gi) ?? []).length;
  const explicitBreaks = (input.html.match(/(?:break-before\s*:\s*page|page-break-before\s*:\s*always|data-page-break)/gi) ?? []).length;
  const charactersPerPage = options.charactersPerPage ?? 1_200;
  const estimatedPages = Math.max(1, explicitBreaks + 1, Math.ceil(textCharacters / charactersPerPage) + Math.ceil(imageCount * 0.75));
  const rawTimeout = (options.baseTimeoutMs ?? 15_000)
    + estimatedPages * (options.timeoutPerPageMs ?? 650)
    + imageCount * (options.timeoutPerImageMs ?? 1_000);

  return Object.freeze({
    estimatedPages,
    imageCount,
    textCharacters,
    timeoutMs: Math.min(maximum, Math.max(minimum, rawTimeout))
  });
}
