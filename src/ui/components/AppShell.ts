import { projectExplorerTemplate } from './ProjectExplorer';
import { editorPanelTemplate } from './EditorPanel';
import { previewPanelTemplate } from './PreviewPanel';
import { projectMetadataDrawerTemplate } from './ProjectMetadataDrawer';
import { symbolPickerDrawerTemplate } from './SymbolPickerDrawer';
import { settingsDrawerTemplate } from './SettingsDrawer';
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
          <span class="app-name">Clear Writer</span>
          <span class="project-name-separator" aria-hidden="true">—</span>
          <span id="project-name" class="project-name">No project open</span>
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
        <nav class="activity-bar" aria-label="Workspace views">
          <button class="activity-bar-button" id="btn-activity-explorer" type="button" data-activity-view="explorer" aria-label="Explorer" title="Explorer" aria-controls="sidebar" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h6l1.8 2H20v11H4z"/><path d="M4 7.5h16"/></svg>
          </button>
          <button class="activity-bar-button" id="btn-activity-images" type="button" data-activity-view="images" aria-label="Images" title="Images" aria-controls="sidebar" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.5"/><path d="m6 17 4-4 3 3 2-2 3 3"/></svg>
          </button>
          <button class="activity-bar-button" id="btn-activity-outline" type="button" data-activity-view="outline" aria-label="Document outline" title="Document outline" aria-controls="sidebar" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9"/><circle cx="3" cy="6" r=".8"/><circle cx="3" cy="12" r=".8"/><circle cx="3" cy="18" r=".8"/></svg>
          </button>
          <button class="activity-bar-button activity-bar-settings" id="btn-activity-settings" type="button" aria-label="Settings" title="Settings" aria-controls="settings-drawer">
            ${settingsIconMarkup()}
          </button>
        </nav>
        ${projectExplorerTemplate()}
        <div id="explorer-resizer" class="explorer-resizer" role="separator" aria-orientation="vertical" aria-label="Resize explorer panel" tabindex="0"></div>
        ${editorPanelTemplate()}
        ${previewPanelTemplate()}
      </div>
    </main>
    <footer class="workspace-status-bar" aria-label="Workspace status">
      <div class="workspace-status-left">
        <span id="editor-status-dot" class="status-dot"></span>
        <span id="editor-status">Ready</span>
        <span id="workspace-diagnostics" class="preview-diagnostics" aria-live="polite">idle</span>
        <span id="workspace-mode-chip" class="workspace-mode-chip" hidden aria-live="polite"></span>
      </div>
      <div class="workspace-status-right">
        <span id="workspace-word-count">0 words</span>
        <span id="workspace-line-count">0 lines</span>
      </div>
    </footer>
    <div id="drawer-container" class="drawer-container">
      <div id="drawer-backdrop" class="drawer-backdrop hidden" aria-hidden="true"></div>
      ${settingsDrawerTemplate()}
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
