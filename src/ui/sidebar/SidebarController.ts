import { SectionList } from './SectionList';
import { ImageList } from './ImageList';
import { APP_STATE_EVENTS, state } from '../../state';
import { ProjectService } from '../../services/ProjectService';
import type { ProjectHealthReport } from '../../types';
import type { Platform, WorkspaceSession } from '../../platform/types';
import { showNewProjectModal, showOpenProjectModal } from '../project-flow-modal';
import { showNotice } from '../components/Notice';
import { showConfirmDialog } from '../confirm-dialog';
import type { WorkspaceRef } from '../../platform/types';
import { closeAllDrawers } from '../drawer-manager';
import {
  buildProjectHealthFailureMessage,
  buildRecoveryPromptMessage,
  buildRecoverySuccessMessage,
  describeWorkspaceError
} from '../../services/project-runtime-feedback';

export class SidebarController {
  private btnNew: HTMLElement;
  private btnOpen: HTMLElement;
  private btnSave: HTMLElement;
  private btnCloseProject: HTMLButtonElement | null;
  private btnFullDoc: HTMLElement | null;
  private btnNewSection: HTMLElement | null;
  private sectionListEl: HTMLElement;
  private imageListEl: HTMLElement;
  private imagePreviewEl: HTMLImageElement;
  private imagePreviewEmptyEl: HTMLElement;
  private imagePreviewCaptionEl: HTMLElement;

  private onLoadProject: (session: WorkspaceSession) => Promise<void>;
  private onSaveActiveFile: () => Promise<boolean>;
  private onInsertText?: (text: string) => boolean;
  private platform: Platform;
  private btnInsertImage: HTMLButtonElement | null;

  constructor(
    platform: Platform,
    onLoadProject: (session: WorkspaceSession) => Promise<void>,
    onSaveActiveFile: () => Promise<boolean>,
    onInsertText?: (text: string) => boolean
  ) {
    this.platform = platform;
    this.onInsertText = onInsertText;
    this.btnNew = document.getElementById('btn-new')!;
    this.btnOpen = document.getElementById('btn-open')!;
    this.btnSave = document.getElementById('btn-save')!;
    this.btnCloseProject = document.getElementById('btn-close-project') as HTMLButtonElement | null;
    this.btnFullDoc = document.getElementById('btn-full-doc');
    this.btnNewSection = document.getElementById('btn-new-section');
    this.sectionListEl = document.getElementById('section-list')!;
    this.imageListEl = document.getElementById('image-list')!;
    
    const previewContainer = document.getElementById('image-preview-card')!;
    this.imagePreviewEl = previewContainer.querySelector('.image-preview')!;
    this.imagePreviewEmptyEl = previewContainer.querySelector('.image-preview-empty')!;
    this.imagePreviewCaptionEl = previewContainer.querySelector('.image-preview-caption')!;
    this.btnInsertImage = previewContainer.querySelector('#btn-insert-image');

    this.onLoadProject = onLoadProject;
    this.onSaveActiveFile = onSaveActiveFile;

    this.setupEventListeners();

    // Bind state changes
    state.on(APP_STATE_EVENTS.projectChanged, () => {
      const { projectRef } = state.current;
      const sidebarContainer = document.querySelector('.explorer-container');
      if (sidebarContainer) {
        sidebarContainer.classList.toggle('is-project-closed', !projectRef);
      }
      this.syncProjectIdentity();
    });

    state.on(APP_STATE_EVENTS.projectTreeChanged, () => {
      this.render();
    });

    state.on(APP_STATE_EVENTS.projectSnapshotChanged, () => {
      this.render();
    });



    state.on(APP_STATE_EVENTS.selectionChanged, () => {
      this.updateActiveStates();
    });

    this.syncProjectIdentity();
  }

  private setupEventListeners() {
    this.btnNew.addEventListener('click', async () => {
      try {
        let ref: WorkspaceRef | null = null;
        const choice = await showNewProjectModal();
        if (!choice) return;

        if (choice.action === 'directory') {
          ref = await this.platform.workspaceRepository.selectDirectory({ kind: 'directory' });
        } else if (choice.action === 'opfs') {
          ref = await this.platform.workspaceRepository.selectDirectory({ kind: 'opfs', name: choice.name });
        }

        if (ref) {
          await this.onSaveActiveFile();
          this.prepareForProjectTransition();
          state.setProjectRef(ref);
          const session = await this.platform.workspaceRepository.open(ref);
          this.updateWorkspaceChip(session);
          await this.onLoadProject(session);
          state.setFullDocMode();
        }
      } catch (error) {
        console.error('Failed to create new project:', error);
        showNotice(describeWorkspaceError(error, 'open'), 'error');
      }
    });

    this.btnOpen.addEventListener('click', async () => {
      try {
        let ref: WorkspaceRef | null = null;
        const recents = this.platform.workspaceRepository.listKnownBrowserWorkspaces 
          ? await this.platform.workspaceRepository.listKnownBrowserWorkspaces() 
          : [];
        const choice = await showOpenProjectModal(recents);
        if (!choice) return;

        if (choice.action === 'directory-picker') {
          ref = await this.platform.workspaceRepository.selectDirectory({ kind: 'directory' });
        } else if (choice.action === 'open-ref') {
          ref = choice.ref;
        }

        if (ref) {
          await this.onSaveActiveFile();
          this.prepareForProjectTransition();
          
          let health: ProjectHealthReport | null = null;
          try {
            const session = await this.platform.workspaceRepository.open(ref);
            health = await ProjectService.checkProjectHealth(session);
          } catch (e) {
            console.warn('Could not read settings directly, trying recovery...', e);
          }

          if (health && health.issues.some(issue => issue.code === 'settings-invalid' || issue.code === 'settings-missing')) {
            const proceed = await showConfirmDialog({
              title: 'Settings Recovery',
              message: buildRecoveryPromptMessage(health),
              confirmLabel: 'Recover',
              tone: 'default'
            });
            if (proceed) {
              const session = await this.platform.workspaceRepository.open(ref);
              const recoveredReport = await session.recoverProjectSettings();
              if (!recoveredReport.valid) {
                showNotice(buildProjectHealthFailureMessage(recoveredReport), 'error');
                return;
              }
              showNotice(buildRecoverySuccessMessage(recoveredReport), 'info');
            } else {
              return;
            }
          }

          if (health && !health.valid && !health.recoverable) {
            showNotice(buildProjectHealthFailureMessage(health), 'error');
            return;
          }

          state.setProjectRef(ref);
          const session = await this.platform.workspaceRepository.open(ref);
          this.updateWorkspaceChip(session);
          await this.onLoadProject(session);
          state.setFullDocMode();
        }
      } catch (error) {
        console.error('Failed to open project:', error);
        showNotice(describeWorkspaceError(error, 'open'), 'warning');
      }
    });

    if (this.btnCloseProject) {
      this.btnCloseProject.addEventListener('click', async () => {
        if (!state.current.projectRef) return;
        try {
          await this.onSaveActiveFile();
          this.prepareForProjectTransition();
          ProjectService.setActiveSession(null);
          state.closeProject();
        } catch (error) {
          console.error('Failed to close project:', error);
          showNotice(describeWorkspaceError(error, 'close'), 'error');
        }
      });
    }

    if (this.btnFullDoc) {
      this.btnFullDoc.addEventListener('click', async () => {
        if (!state.get.projectRef) return;
        await this.onSaveActiveFile();
        state.setFullDocMode();
      });
    }

    this.btnSave.addEventListener('click', async () => {
      if (!state.get.isFullDocMode && state.current.activeFile) {
        try {
          await this.onSaveActiveFile();
          this.btnSave.style.color = '#10b981';
          setTimeout(() => this.btnSave.style.color = '', 1000);
        } catch (error) {
          console.error('Save failed:', error);
          showNotice(describeWorkspaceError(error, 'save'), 'error');
        }
      } else {
        showNotice('Open a specific section to save it.', 'info');
      }
    });

    if (this.btnNewSection) {
      this.btnNewSection.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { projectRef } = state.get;
        if (!projectRef) return showNotice('No project open', 'warning');
        SectionList.renderInlineCreate(this.sectionListEl, false);
      });
    }

    const btnNewFolder = document.getElementById('btn-new-folder');
    if (btnNewFolder) {
      btnNewFolder.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { projectRef } = state.get;
        if (!projectRef) return showNotice('No project open', 'warning');
        SectionList.renderInlineCreate(this.sectionListEl, true);
      });
    }

    const btnAddImage = document.getElementById('btn-add-image');
    if (btnAddImage) {
      btnAddImage.addEventListener('click', () => {
        const { projectRef } = state.get;
        if (!projectRef) return showNotice('No project open', 'warning');
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (!files || files.length === 0) return;
          
          try {
            const session = await this.platform.workspaceRepository.open(projectRef);
            for (const file of Array.from(files)) {
              const buffer = new Uint8Array(await file.arrayBuffer());
              await ProjectService.uploadImage(session, file.name, buffer);
            }
          } catch (err) {
            console.error('Failed to upload image:', err);
            showNotice('Could not upload one or more images.', 'error');
          }
        };
        input.click();
      });
    }

    const imageBrowser = document.querySelector('.image-browser');
    if (imageBrowser) {
      imageBrowser.addEventListener('dragover', (e) => {
        const ev = e as DragEvent;
        if (ev.dataTransfer?.types.includes('Files')) {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
        }
      });
      imageBrowser.addEventListener('drop', async (e) => {
        const ev = e as DragEvent;
        const files = ev.dataTransfer?.files;
        if (!files || files.length === 0) return;
        
        const { projectRef } = state.get;
        if (!projectRef) return;
        
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        
        ev.preventDefault();
        try {
          const session = await this.platform.workspaceRepository.open(projectRef);
          for (const file of imageFiles) {
            const buffer = new Uint8Array(await file.arrayBuffer());
            await ProjectService.uploadImage(session, file.name, buffer);
          }
        } catch (err) {
          console.error('Failed to drop upload image:', err);
          showNotice('Could not upload dropped images.', 'error');
        }
      });
    }

    if (this.btnInsertImage) {
      this.btnInsertImage.addEventListener('click', () => {
        const imagePath = this.btnInsertImage?.dataset.imagePath;
        const altText = this.btnInsertImage?.dataset.altText || 'image';
        if (!imagePath) return;

        const { isFullDocMode, activeFile } = state.get;
        if (isFullDocMode || !activeFile) {
          showNotice('Open a section to insert an image.', 'warning');
          return;
        }

        const markdown = `![${altText}](<${imagePath}>)`;
        if (this.onInsertText) {
          const success = this.onInsertText(markdown);
          if (!success) {
            showNotice('Failed to insert image. No active editor.', 'error');
          }
        }
      });
    }
  }

  private prepareForProjectTransition() {
    closeAllDrawers();
    const modalHost = document.getElementById('project-flow-modal');
    if (modalHost) modalHost.innerHTML = '';
  }

  private syncProjectIdentity() {
    const projectName = document.getElementById('project-name');
    const chip = document.getElementById('workspace-mode-chip');
    const ref = state.current.projectRef;

    if (projectName) {
      projectName.textContent = ref?.displayName || 'No project open';
      projectName.title = ref?.displayName || 'No project open';
    }

    if (!chip) return;
    if (!ref) {
      chip.hidden = true;
      chip.textContent = '';
      chip.title = '';
    } else {
      chip.hidden = false;
      chip.dataset.kind = ref.kind;
      chip.textContent = ref.kind === 'directory' ? 'Local folder' : 'Browser storage';
      chip.title = ref.kind === 'directory'
        ? 'This project is stored in a local folder on your device'
        : 'This project is stored in browser private storage';
    }

    if (this.btnCloseProject) {
      this.btnCloseProject.disabled = !ref;
      this.btnCloseProject.setAttribute('aria-disabled', String(!ref));
    }
  }

  private updateWorkspaceChip(session: WorkspaceSession) {
    const chip = document.getElementById('workspace-mode-chip');
    if (!chip) return;
    
    chip.hidden = false;
    chip.dataset.kind = session.kind;
    chip.textContent = session.kind === 'directory' ? 'Local folder' : 'Browser storage';
    chip.title = session.kind === 'directory'
      ? 'This project is stored in a local folder on your device'
      : 'This project is stored in browser private storage';
  }

  private render() {
    SectionList.render(this.sectionListEl, this.onSaveActiveFile, this.platform);
    ImageList.render(this.imageListEl, {
      image: this.imagePreviewEl,
      empty: this.imagePreviewEmptyEl,
      caption: this.imagePreviewCaptionEl,
      btnInsert: this.btnInsertImage || undefined
    }, this.platform);
    this.updateActiveStates();
  }

  private updateActiveStates() {
    const { isFullDocMode, activeFile } = state.get;
    const normalizedActiveFile = activeFile ? activeFile.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') : null;

    if (this.btnFullDoc) {
      if (isFullDocMode) {
        this.btnFullDoc.classList.add('is-active');
        this.btnFullDoc.setAttribute('aria-pressed', 'true');
      } else {
        this.btnFullDoc.classList.remove('is-active');
        this.btnFullDoc.setAttribute('aria-pressed', 'false');
      }
    }

    if (isFullDocMode || !activeFile) {
      Array.from(this.sectionListEl.querySelectorAll<HTMLElement>('.tree-row[data-path]')).forEach(row => {
        row.classList.remove('active');
      });
      return;
    }

    if (SectionList.revealPath(activeFile)) {
      this.render();
      return;
    }

    Array.from(this.sectionListEl.querySelectorAll<HTMLElement>('.tree-row[data-path]')).forEach(row => {
      const path = row.dataset.path;
      if (path === normalizedActiveFile) {
        row.classList.add('active');
      } else {
        row.classList.remove('active');
      }
    });
  }
}
