export interface SplitPaneControllerOptions {
  container: HTMLElement;
  separator: HTMLElement;
  cssProperty: string;
  defaultRatio: number;
  minimumLeadingWidth: number;
  minimumTrailingWidth: number;
  separatorWidth: number;
  storageKey?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export interface SplitPaneConstraints {
  containerLeft: number;
  usableWidth: number;
  minimumLeadingWidth: number;
  maximumLeadingWidth: number;
  compact: boolean;
}
