import { closeAllDrawers, closeDrawer, openDrawer } from './drawer-manager';

const SETTINGS_TAB_ACTIVATED_EVENT = 'clear-writer-settings-tab-activated';

export type PageSetupTabId = 'page-setup' | 'toc' | 'special-headings';
export type StylesTabId = 'typography' | 'lists' | 'tables' | 'images' | 'inline-styles' | 'quote-styles';
export type PreferencesTabId = 'editor';

export type SettingsTabId = PageSetupTabId | StylesTabId | PreferencesTabId;

const PAGE_SETUP_TABS = new Set<SettingsTabId>(['page-setup', 'toc', 'special-headings']);
const STYLES_TABS = new Set<SettingsTabId>(['typography', 'lists', 'tables', 'images', 'inline-styles', 'quote-styles']);

function dispatchSettingsTabActivated(tabId: SettingsTabId): void {
  document.dispatchEvent(new CustomEvent<{ tabId: SettingsTabId }>(SETTINGS_TAB_ACTIVATED_EVENT, {
    detail: { tabId }
  }));
}

function activateTabInDrawer(drawer: HTMLElement, tabId: SettingsTabId): void {
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

export function openPageSetupDrawer(tabId?: PageSetupTabId): boolean {
  const drawer = document.getElementById('page-setup-drawer');
  if (!drawer) return false;
  const opened = openDrawer(drawer);
  const currentTab = drawer.querySelector<HTMLButtonElement>('[data-settings-tab].active')?.dataset.settingsTab as PageSetupTabId | undefined;
  activateTabInDrawer(drawer, tabId ?? currentTab ?? 'page-setup');
  return opened;
}

export function openStylesDrawer(tabId?: StylesTabId): boolean {
  const drawer = document.getElementById('styles-drawer');
  if (!drawer) return false;
  const opened = openDrawer(drawer);
  const currentTab = drawer.querySelector<HTMLButtonElement>('[data-settings-tab].active')?.dataset.settingsTab as StylesTabId | undefined;
  activateTabInDrawer(drawer, tabId ?? currentTab ?? 'typography');
  return opened;
}

export function openPreferencesDrawer(tabId?: PreferencesTabId): boolean {
  const drawer = document.getElementById('preferences-drawer');
  if (!drawer) return false;
  const opened = openDrawer(drawer);
  const currentTab = drawer.querySelector<HTMLButtonElement>('[data-settings-tab].active')?.dataset.settingsTab as PreferencesTabId | undefined;
  activateTabInDrawer(drawer, tabId ?? currentTab ?? 'editor');
  return opened;
}

/** @deprecated Route to openPageSetupDrawer or openStylesDrawer instead. */
export function openSettingsDrawer(tabId?: SettingsTabId): boolean {
  if (!tabId || PAGE_SETUP_TABS.has(tabId)) {
    return openPageSetupDrawer(tabId as PageSetupTabId | undefined);
  }
  if (STYLES_TABS.has(tabId)) {
    return openStylesDrawer(tabId as StylesTabId);
  }
  return openPreferencesDrawer(tabId as PreferencesTabId);
}

export function onSettingsTabActivated(tabId: SettingsTabId, listener: () => void): () => void {
  const wrapped = (event: Event) => {
    const detail = (event as CustomEvent<{ tabId?: SettingsTabId }>).detail;
    if (detail?.tabId === tabId) listener();
  };
  document.addEventListener(SETTINGS_TAB_ACTIVATED_EVENT, wrapped);
  return () => document.removeEventListener(SETTINGS_TAB_ACTIVATED_EVENT, wrapped);
}

function wireDrawerTabs(drawerId: string): void {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;

  drawer.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.settingsTab as SettingsTabId | undefined;
      if (tabId) activateTabInDrawer(drawer, tabId);
    });
  });
}

function wireActivityButton(buttonId: string, openFn: () => void): void {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.addEventListener('click', openFn);
}

function wireCloseButton(buttonId: string, drawerId: string): void {
  const button = document.getElementById(buttonId);
  const backdrop = document.getElementById('drawer-backdrop');
  if (button) {
    button.addEventListener('click', () => closeDrawer(drawerId));
  }
  backdrop?.addEventListener('click', () => closeAllDrawers());
}

export function initSettingsDrawers(): void {
  wireDrawerTabs('page-setup-drawer');
  wireDrawerTabs('styles-drawer');
  wireDrawerTabs('preferences-drawer');

  wireActivityButton('btn-activity-page-setup', () => {
    const drawer = document.getElementById('page-setup-drawer');
    if (drawer && !drawer.classList.contains('hidden')) {
      closeDrawer(drawer);
    } else {
      openPageSetupDrawer();
    }
  });

  wireActivityButton('btn-activity-styles', () => {
    const drawer = document.getElementById('styles-drawer');
    if (drawer && !drawer.classList.contains('hidden')) {
      closeDrawer(drawer);
    } else {
      openStylesDrawer();
    }
  });

  wireActivityButton('btn-preferences', () => {
    const drawer = document.getElementById('preferences-drawer');
    if (drawer && !drawer.classList.contains('hidden')) {
      closeDrawer(drawer);
    } else {
      openPreferencesDrawer();
    }
  });

  wireCloseButton('btn-close-page-setup-drawer', 'page-setup-drawer');
  wireCloseButton('btn-close-styles-drawer', 'styles-drawer');
  wireCloseButton('btn-close-preferences-drawer', 'preferences-drawer');
}

/** @deprecated Use initSettingsDrawers() instead. */
export function initSettingsDrawer(_bindOpenButton = true): void {
  initSettingsDrawers();
}
