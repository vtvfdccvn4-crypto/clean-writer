import { state } from '../state';
import type { SettingsTabId } from './settings-drawer';
import { onSettingsTabActivated } from './settings-drawer';

/** Keeps a settings panel synchronized with the active project's snapshot. */
export function bindProjectSettingsPanel(
  sync: () => void,
  options: { tabId?: SettingsTabId; onTabActivated?: () => void } = {}
): () => void {
  const unsubscribeSnapshot = state.onProjectSnapshotChanged(sync);
  const unsubscribeSettings = state.onSettingsSnapshotChanged(sync);
  let unsubscribeTab: () => void = () => {};
  if (options.tabId) {
    unsubscribeTab = onSettingsTabActivated(options.tabId, () => {
      sync();
      options.onTabActivated?.();
    });
  }
  sync();
  return () => {
    unsubscribeSnapshot();
    unsubscribeSettings();
    unsubscribeTab();
  };
}

/** Refreshes controls whose options depend on the current project tree. */
export function bindProjectTreePanel(sync: () => void): () => void {
  const unsubscribeSnapshot = state.onProjectSnapshotChanged(sync);
  const unsubscribeSettings = state.onSettingsSnapshotChanged(sync);
  const unsubscribeTree = state.onProjectTreeChanged(sync);
  return () => {
    unsubscribeSnapshot();
    unsubscribeSettings();
    unsubscribeTree();
  };
}
