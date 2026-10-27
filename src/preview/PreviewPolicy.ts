/**
 * Source size, in characters, above which a document opens in the live preview.
 * On the baseline machine (reports/phase0-baseline.md), compiling and paginating a
 * document of about this size takes about 2 s, which is the most the app will spend
 * on a print preview the user did not ask for. Above it, pagination and page-break
 * guides run only when requested.
 */
export const LARGE_DOCUMENT_CHARACTERS = 400_000;

/**
 * Whether the print (paginated) preview is built and current:
 * - `not-built`: the document opened in the live preview and no print preview exists.
 * - `out-of-date`: a print preview exists but the document has changed since it was built.
 */
export type PrintPreviewFreshness = 'not-built' | 'out-of-date';

export function isLargeDocument(sourceCharacters: number): boolean {
  return sourceCharacters > LARGE_DOCUMENT_CHARACTERS;
}
