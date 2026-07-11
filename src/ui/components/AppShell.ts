import { projectExplorerTemplate } from './ProjectExplorer';
import { editorPanelTemplate } from './EditorPanel';
import { previewPanelTemplate } from './PreviewPanel';
import { projectMetadataDrawerTemplate } from './ProjectMetadataDrawer';
import { symbolPickerDrawerTemplate } from './SymbolPickerDrawer';
import { settingsDrawerTemplate } from './SettingsDrawer';
import { documentOutlineDrawerTemplate } from './DocumentOutlineDrawer';
import { projectSearchDrawerTemplate } from './ProjectSearchDrawer';
import { projectReviewDrawerTemplate } from './ProjectReviewDrawer';

function settingsIconMarkup(): string {
  return `
    <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M14 8.77v-1.54l-1.63-.3c-.15-.55-.38-1.07-.66-1.55l.93-1.42-1.09-1.09-1.42.93c-.48-.28-1-.51-1.55-.66L8.27 1.5h-1.54l-.3 1.63c-.55.15-1.07.38-1.55.66l-1.42-.93-1.09 1.09.93 1.42c-.28.48-.51 1-.66 1.55L1.5 7.23v1.54l1.63.3c.15.55.38 1.07.66 1.55l-.93 1.42 1.09 1.09 1.42-.93c.48.28 1 .51 1.55.66l.3 1.63h1.54l.3-1.63c.55-.15 1.07-.38 1.55-.66l1.42.93 1.09-1.09-.93-1.42c.28-.48.51-1 .66-1.55l1.63-.3Z"/>
      <circle cx="8" cy="8" r="2.05"/>
    </svg>
  `;
}

export const appShellTemplate = (): string => `
  <div id="app-layout" class="app-layout">
    <header class="app-bar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">C</span>
        <div class="project-identity">
          <span>Clear Writer</span>
          <span id="project-name" class="project-name">No project open</span>
          <span id="workspace-mode-chip" class="workspace-mode-chip" hidden aria-live="polite"></span>
        </div>
      </div>
      <div class="app-actions">
        <button id="btn-settings" class="icon-text-button" type="button" aria-label="Settings" title="Settings" aria-controls="settings-drawer" aria-expanded="false">
          ${settingsIconMarkup()}
          <span>Settings</span>
        </button>
      </div>
    </header>
    <main class="workspace-shell">
      <div class="workspace">
        ${projectExplorerTemplate()}
        ${editorPanelTemplate()}
        ${previewPanelTemplate()}
      </div>
    </main>
    <div id="drawer-container" class="drawer-container">
      <div id="drawer-backdrop" class="drawer-backdrop hidden" aria-hidden="true"></div>
      ${settingsDrawerTemplate()}
      ${documentOutlineDrawerTemplate()}
      ${projectSearchDrawerTemplate()}
      ${projectReviewDrawerTemplate()}
      ${projectMetadataDrawerTemplate()}
      ${symbolPickerDrawerTemplate()}
    </div>
    <div id="project-flow-modal"></div>
    <div id="notice-container" class="notice-container" aria-live="polite"></div>
  </div>
`;

export const renderAppShell = (root: HTMLElement): void => {
  root.innerHTML = appShellTemplate();
};
