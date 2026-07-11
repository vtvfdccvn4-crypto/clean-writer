import { closeDrawer, openDrawer } from './drawer-manager';

export const SETTINGS_TAB_ACTIVATED_EVENT = 'clear-writer-settings-tab-activated';

export type SettingsTabId =
  | 'page-setup'
  | 'typography'
  | 'lists'
  | 'tables'
  | 'toc'
  | 'editor'
  | 'inline-styles'
  | 'quote-styles';

function dispatchSettingsTabActivated(tabId: SettingsTabId): void {
  document.dispatchEvent(new CustomEvent<{ tabId: SettingsTabId }>(SETTINGS_TAB_ACTIVATED_EVENT, {
    detail: { tabId }
  }));
}

export function activateSettingsTab(tabId: SettingsTabId): void {
  const drawer = document.getElementById('settings-drawer');
  if (!drawer) return;

  drawer.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((button) => {
    const isActive = button.dataset.settingsTab === tabId;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  drawer.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.settingsPanel !== tabId);
  });

  dispatchSettingsTabActivated(tabId);
}

export function openSettingsDrawer(tabId?: SettingsTabId): boolean {
  const drawer = document.getElementById('settings-drawer');
  if (!drawer) return false;

  const opened = openDrawer(drawer);
  const currentTab = drawer.querySelector<HTMLButtonElement>('[data-settings-tab].active')?.dataset.settingsTab as SettingsTabId | undefined;
  const activeTab = tabId ?? currentTab ?? 'page-setup';
  activateSettingsTab(activeTab);
  return opened;
}

export function onSettingsTabActivated(tabId: SettingsTabId, listener: () => void): () => void {
  const wrapped = (event: Event) => {
    const detail = (event as CustomEvent<{ tabId?: SettingsTabId }>).detail;
    if (detail?.tabId === tabId) listener();
  };
  document.addEventListener(SETTINGS_TAB_ACTIVATED_EVENT, wrapped);
  return () => document.removeEventListener(SETTINGS_TAB_ACTIVATED_EVENT, wrapped);
}

export function initSettingsDrawer(): void {
  const drawer = document.getElementById('settings-drawer');
  const openButton = document.getElementById('btn-settings');
  const closeButton = document.getElementById('btn-close-settings-drawer');
  if (!drawer || !openButton || !closeButton) return;

  openButton.addEventListener('click', () => {
    openSettingsDrawer();
  });

  closeButton.addEventListener('click', () => {
    closeDrawer(drawer);
  });

  drawer.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.settingsTab as SettingsTabId | undefined;
      if (tabId) activateSettingsTab(tabId);
    });
  });
}
