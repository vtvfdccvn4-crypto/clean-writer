import { state } from '../../state';
import { editorPanelTemplate } from './EditorPanel';
import { previewPanelTemplate } from './PreviewPanel';
import { explorerPanelTemplate } from './ExplorerPanel';
import { projectMetadataDrawerTemplate } from './ProjectMetadataDrawer';
import { symbolPickerDrawerTemplate } from './SymbolPickerDrawer';
import { pageSetupDrawerTemplate, stylesDrawerTemplate } from './SettingsDrawer';
import { editorPreferencesDrawerTemplate } from './PreferencesDrawer';
import { shellPreferencesDrawerTemplate } from './ShellPreferencesDrawer';
import { projectSearchDrawerTemplate } from './ProjectSearchDrawer';
import { projectReviewDrawerTemplate } from './ProjectReviewDrawer';
import { materialIcon } from './icon';
import { toolbarButton } from './toolbarButton';

function activityIconMarkup(kind: 'explorer' | 'images' | 'outline' | 'preferences'): string {
  switch (kind) {
    case 'explorer':
      return materialIcon('account_tree');
    case 'images':
      return materialIcon('photo_library');
    case 'outline':
      return materialIcon('library_books');
    case 'preferences':
      return materialIcon('settings');
  }
}

const appShellTemplate = (): string => `
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
        ${toolbarButton({ id: 'btn-task-new-project', variant: 'icon', ariaLabel: 'New project', title: 'New project', icon: materialIcon('loupe') })}
        ${toolbarButton({ id: 'btn-task-open-project', variant: 'icon', ariaLabel: 'Open project', title: 'Open project', icon: materialIcon('pending') })}
        ${toolbarButton({ id: 'btn-task-close-project', variant: 'icon', ariaLabel: 'Close project', title: 'Close project', content: '<span aria-hidden="true">×</span>' })}
        ${toolbarButton({ id: 'btn-task-refresh-project', variant: 'icon', ariaLabel: 'Refresh project files', title: 'Refresh project files (Ctrl+Shift+I)', icon: materialIcon('rotate_left') })}
        ${toolbarButton({ id: 'btn-project-metadata', variant: 'icon', ariaLabel: 'Project metadata', title: 'Project metadata', icon: materialIcon('info') })}
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
            <button class="activity-bar-button activity-bar-settings" id="btn-activity-preferences" type="button" aria-label="Shell preferences" title="Shell preferences" aria-controls="shell-preferences-drawer">
              ${activityIconMarkup('preferences')}
            </button>
          </nav>
          <div id="task-panel">
            ${explorerPanelTemplate()}
          </div>
          <div id="task-panel-resizer" class="task-panel-resizer" role="separator" aria-orientation="vertical" aria-label="Resize task panel"></div>
          <div id="shared-panel">
            <div class="shared-panel-split shared-panel-split--editor">
              ${editorPanelTemplate()}
            </div>
            <div id="editor-preview-resizer" class="editor-preview-resizer" role="separator" aria-orientation="vertical" aria-label="Resize editor and preview" tabindex="0"></div>
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
      ${pageSetupDrawerTemplate()}
      ${stylesDrawerTemplate()}
      ${editorPreferencesDrawerTemplate()}
      ${shellPreferencesDrawerTemplate()}
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

export function initProjectNameDisplay(): void {
  const el = document.getElementById('project-name');
  if (!el) return;
  const update = () => {
    el.textContent = state.current.projectRef?.displayName ?? 'No project open';
  };
  update();
  state.onProjectChanged(update);
}
