import type { CommittedPreviewTarget } from './CommittedPreviewIndex';

export type PreviewTargetFallback = 'preceding' | 'next-or-preceding';
export type PreviewTargetComparator = (left: CommittedPreviewTarget, right: CommittedPreviewTarget) => number;

/** Resolves one source line without allocating filtered or sorted target copies. */
export function resolveSourceLineTarget(
  targets: readonly CommittedPreviewTarget[],
  line: number,
  fallback: PreviewTargetFallback = 'preceding',
  compare: PreviewTargetComparator = comparePreviewTargets
): CommittedPreviewTarget | null {
  let containing: CommittedPreviewTarget | null = null;
  let preceding: CommittedPreviewTarget | null = null;
  let following: CommittedPreviewTarget | null = null;
  for (const target of targets) {
    const { startLine, endLine } = target.entry.range;
    if (startLine <= line && endLine >= line) {
      if (!containing || compare(target, containing) < 0) containing = target;
    } else if (startLine <= line) {
      if (!preceding || compare(target, preceding) < 0) preceding = target;
    } else if (fallback === 'next-or-preceding' && (!following || startLine < following.entry.range.startLine)) {
      following = target;
    }
  }
  return containing ?? following ?? preceding;
}

const comparePreviewTargets: PreviewTargetComparator = (
  left: CommittedPreviewTarget,
  right: CommittedPreviewTarget
): number => {
  const leftSpan = left.entry.range.endLine - left.entry.range.startLine;
  const rightSpan = right.entry.range.endLine - right.entry.range.startLine;
  if (leftSpan !== rightSpan) return leftSpan - rightSpan;
  if (left.entry.range.startLine !== right.entry.range.startLine) {
    return right.entry.range.startLine - left.entry.range.startLine;
  }
  return right.entry.priority - left.entry.priority;
};

/** Keeps split content on its first visible physical page for linked scrolling. */
export const comparePreviewTargetsByPage: PreviewTargetComparator = (left, right): number => {
  const leftSpan = left.entry.range.endLine - left.entry.range.startLine;
  const rightSpan = right.entry.range.endLine - right.entry.range.startLine;
  if (leftSpan !== rightSpan) return leftSpan - rightSpan;
  return left.pageIndex - right.pageIndex;
};
