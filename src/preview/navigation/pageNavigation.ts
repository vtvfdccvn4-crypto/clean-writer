/** Resolves what the page-jump field contains. Only whole numbers from 1 to the page count are accepted. */
export function resolvePageNumber(value: string, pageCount: number): { ok: true; page: number } | { ok: false; message: string } {
  if (pageCount < 1) return { ok: false, message: 'There are no pages to go to.' };
  const trimmed = value.trim();
  const page = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    return { ok: false, message: `Enter a page number from 1 to ${pageCount}.` };
  }
  return { ok: true, page };
}

/**
 * The index of the heading to move to, given each heading's offset from the top of
 * the scroll area. `threshold` is the line a heading is aligned to. Forward moves to
 * the first heading below that line. Backward moves to the heading above it, or to
 * the heading just before the current one when the current one is already aligned.
 * Returns null when there is nowhere to go.
 */
export function adjacentHeadingIndex(tops: readonly number[], threshold: number, direction: 1 | -1): number | null {
  // A heading within the tolerance of the line counts as reached. Scrolling to it leaves
  // it a fraction of a pixel off the line, and without the tolerance "next" would find it again.
  const alignedTolerance = 2;
  const reached = threshold + alignedTolerance;
  let current = -1;
  for (let index = 0; index < tops.length; index += 1) {
    if (tops[index]! <= reached) current = index;
    else break;
  }
  if (direction === 1) {
    const next = current + 1;
    return next < tops.length ? next : null;
  }
  if (current < 0) return null;
  const aligned = Math.abs(tops[current]! - threshold) <= alignedTolerance;
  const previous = aligned ? current - 1 : current;
  return previous >= 0 ? previous : null;
}
