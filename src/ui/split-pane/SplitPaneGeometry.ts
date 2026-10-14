import type { SplitPaneConstraints } from './contracts';

export function calculateSplitPaneConstraints(
  containerLeft: number,
  containerWidth: number,
  separatorWidth: number,
  minimumLeadingWidth: number,
  minimumTrailingWidth: number
): SplitPaneConstraints {
  const usableWidth = Math.max(0, containerWidth - separatorWidth);
  const compact = usableWidth < minimumLeadingWidth + minimumTrailingWidth;
  return {
    containerLeft,
    usableWidth,
    minimumLeadingWidth,
    maximumLeadingWidth: Math.max(minimumLeadingWidth, usableWidth - minimumTrailingWidth),
    compact
  };
}

export function clampSplitPaneRatio(ratio: number, constraints: SplitPaneConstraints, defaultRatio: number): number {
  if (constraints.compact || constraints.usableWidth <= 0) return defaultRatio;
  const width = Math.min(
    constraints.maximumLeadingWidth,
    Math.max(constraints.minimumLeadingWidth, ratio * constraints.usableWidth)
  );
  return width / constraints.usableWidth;
}

export function leadingWidthForRatio(ratio: number, constraints: SplitPaneConstraints): number {
  return Math.round(ratio * constraints.usableWidth);
}
