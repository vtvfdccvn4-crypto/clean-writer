export function readSplitPaneRatio(storageKey: string | undefined): number | null {
  if (!storageKey) return null;
  try {
    const value = Number.parseFloat(window.localStorage.getItem(storageKey) ?? '');
    return Number.isFinite(value) && value > 0 && value < 1 ? value : null;
  } catch {
    return null;
  }
}

export function persistSplitPaneRatio(storageKey: string | undefined, ratio: number): void {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, ratio.toString());
  } catch {
    // Layout resizing remains useful when storage is unavailable.
  }
}
