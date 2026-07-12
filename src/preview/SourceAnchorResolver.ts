export interface SourceAnchor<T = unknown> {
  id: string;
  startLine: number;
  endLine: number;
  value: T;
}

/**
 * Resolves an editor line to the smallest compiled source block that contains
 * it. If Markdown has no block at that line, use the nearest preceding block
 * so blank lines retain predictable preview navigation.
 */
export function resolveSourceAnchor<T>(anchors: readonly SourceAnchor<T>[], line: number): SourceAnchor<T> | null {
  const normalizedLine = Math.max(1, Math.floor(line));
  const containing = anchors.filter(anchor =>
    anchor.startLine <= normalizedLine && anchor.endLine >= normalizedLine
  );

  if (containing.length > 0) {
    return containing.reduce((best, candidate) => {
      const bestRange = best.endLine - best.startLine;
      const candidateRange = candidate.endLine - candidate.startLine;
      if (candidateRange !== bestRange) return candidateRange < bestRange ? candidate : best;
      return candidate.startLine > best.startLine ? candidate : best;
    });
  }

  const preceding = anchors.filter(anchor => anchor.startLine <= normalizedLine);
  if (preceding.length === 0) return null;
  return preceding.reduce((best, candidate) =>
    candidate.startLine > best.startLine ? candidate : best
  );
}
