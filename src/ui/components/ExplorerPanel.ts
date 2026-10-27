import { fontAwesomeIcon, materialIcon } from './icon';
import { toolbarButton } from './toolbarButton';

export const explorerPanelTemplate = (): string => `
  <section class="shared-task-pane pane" aria-label="Task panel">
    <div class="task-toolbar panel-bar panel-header">
      <div class="toolbar-status task-toolbar-title">
        <span class="task-toolbar-title-rule" aria-hidden="true"></span>
        <span id="task-panel-title" class="task-toolbar-title-text">Project tree</span>
      </div>
      <div id="task-panel-actions" class="task-toolbar-actions hidden" aria-label="Project tree actions">
        ${toolbarButton({ id: 'btn-task-new-folder', variant: 'icon', ariaLabel: 'New Container', title: 'New Container', icon: materialIcon('home_storage') })}
        ${toolbarButton({ id: 'btn-task-new-section', variant: 'icon', ariaLabel: 'New Section File', title: 'New Section File', icon: materialIcon('split_scene_down') })}
        ${toolbarButton({ id: 'btn-task-trash', variant: 'icon', ariaLabel: 'Open trash', title: 'Trash: restore or permanently delete sections', icon: fontAwesomeIcon('trash-can') })}
      </div>
    </div>
    <div class="task-content panel-content">
      <section id="task-explorer-view" class="task-view task-explorer-view hidden" aria-label="Project tree">
        <div id="task-explorer-content" class="task-explorer-content"></div>
        <div id="task-explorer-empty" class="task-view-empty">
          <p>No sections in the current project.</p>
        </div>
      </section>
      <section id="task-images-view" class="task-view task-images-view hidden" aria-label="Images">
        <div id="task-images-content" class="task-images-content"></div>
        <div id="task-images-empty" class="task-view-empty">
          <p>No images in the current project.</p>
        </div>
      </section>
      <section class="outline-section" aria-label="Document outline">
        <div id="document-outline-content" class="document-outline-content"></div>
        <div id="document-outline-empty" class="document-outline-empty">
          <p>No headings found in the current project.</p>
        </div>
      </section>
    </div>
    <div class="task-footer panel-bar panel-footer hidden" aria-hidden="true">
      <div id="project-statistics-summary" class="outline-section-summary" aria-live="polite"></div>
    </div>
  </section>
`;
