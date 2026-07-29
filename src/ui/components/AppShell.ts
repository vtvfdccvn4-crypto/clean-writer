import { editorPanelTemplate } from './EditorPanel';
import { previewPanelTemplate } from './PreviewPanel';
import { taskPanelTemplate } from './TaskPanel';
import { projectMetadataDrawerTemplate } from './ProjectMetadataDrawer';
import { symbolPickerDrawerTemplate } from './SymbolPickerDrawer';
import { settingsDrawerTemplate } from './SettingsDrawer';
import { projectSearchDrawerTemplate } from './ProjectSearchDrawer';
import { projectReviewDrawerTemplate } from './ProjectReviewDrawer';

function activityIconMarkup(kind: 'explorer' | 'images' | 'outline' | 'settings'): string {
  switch (kind) {
    case 'explorer':
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h6l1.8 2H20v11H4z"/><path d="M4 7.5h16"/></svg>`;
    case 'images':
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.5"/><path d="m6 17 4-4 3 3 2-2 3 3"/></svg>`;
    case 'outline':
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9"/><circle cx="3" cy="6" r=".8"/><circle cx="3" cy="12" r=".8"/><circle cx="3" cy="18" r=".8"/></svg>`;
    case 'settings':
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-.9-.3c-.2-.7-.5-1.4-.9-2l.5-.9-1.5-1.5-.9.5c-.6-.4-1.3-.7-2-.9L15.5 4h-2l-.3.9c-.7.2-1.4.5-2 .9l-.9-.5-1.5 1.5.5.9c-.4.6-.7 1.3-.9 2l-.9.3v2l.9.3c.2.7.5 1.4.9 2l-.5.9 1.5 1.5.9-.5c.6.4 1.3.7 2 .9l.3.9h2l.3-.9c.7-.2 1.4-.5 2-.9l.9.5 1.5-1.5-.5-.9c.4-.6.7-1.3.9-2l.9-.3v-2Z"/></svg>`;
  }
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
      <div class="app-bar-actions" aria-label="Project actions">
        <button id="btn-task-new-project" class="toolbar-icon-button" type="button" aria-label="New project" title="New project">
          <span aria-hidden="true">+</span>
        </button>
        <button id="btn-task-open-project" class="toolbar-icon-button" type="button" aria-label="Open project" title="Open project">
          <span aria-hidden="true">⌂</span>
        </button>
        <button id="btn-task-close-project" class="toolbar-icon-button" type="button" aria-label="Close project" title="Close project">
          <span aria-hidden="true">×</span>
        </button>
        <button id="btn-task-refresh-project" class="toolbar-icon-button" type="button" aria-label="Refresh project files" title="Refresh project files (Ctrl+Shift+I)">
          <span aria-hidden="true">↻</span>
        </button>
        <button id="btn-project-metadata" class="toolbar-icon-button" type="button" aria-label="Project metadata" title="Project metadata">
          <span aria-hidden="true">M</span>
        </button>
      </div>
    </header>
    <div class="screen-host">
      <main id="welcome-screen-root" class="welcome-screen-root" aria-label="Welcome" hidden></main>
      <main class="workspace-shell">
        <div class="workspace">
          <nav id="project-panel" class="activity-bar" aria-label="Workspace views">
            <div class="activity-bar-primary">
              <button class="activity-bar-button" id="btn-activity-explorer" type="button" data-activity-view="explorer" aria-label="Explorer" title="Explorer" aria-pressed="false">
                ${activityIconMarkup('explorer')}
              </button>
              <button class="activity-bar-button" id="btn-activity-images" type="button" data-activity-view="images" aria-label="Images" title="Images" aria-pressed="false">
                ${activityIconMarkup('images')}
              </button>
              <button class="activity-bar-button" id="btn-activity-outline" type="button" data-activity-view="outline" aria-label="Document outline" title="Document outline" aria-pressed="false">
                ${activityIconMarkup('outline')}
              </button>
            </div>
            <button class="activity-bar-button activity-bar-settings" id="btn-activity-settings" type="button" aria-label="Settings" title="Settings">
              ${activityIconMarkup('settings')}
            </button>
          </nav>
          <div id="task-panel">
            ${taskPanelTemplate()}
          </div>
          <div id="task-panel-resizer" class="task-panel-resizer" role="separator" aria-orientation="vertical" aria-label="Resize task panel"></div>
          <div id="shared-panel">
            <div class="shared-panel-split shared-panel-split--editor">
              ${editorPanelTemplate()}
            </div>
            <div class="shared-panel-split shared-panel-split--preview">
              ${previewPanelTemplate()}
            </div>
          </div>
        </div>
      </main>
    </div>
    <footer class="workspace-status-bar" aria-label="Workspace status">
      <div class="workspace-status-left">
        <span id="editor-status-dot" class="status-dot"></span>
        <span id="editor-status">Ready</span>
        <span id="workspace-diagnostics" class="preview-diagnostics" aria-live="polite">idle</span>
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
