import { localFolderProjectsEnabled } from '../config/mvp-scope';
import { canOpenInPlace } from './document-in-place';

export function showNewProjectModal(): Promise<
  | { action: 'directory' }
  | { action: 'opfs'; name: string }
  | null
> {
  return new Promise((resolve) => {
    const modalHost = document.getElementById('project-flow-modal');
    if (!modalHost) return resolve(null);

    const hasDirectoryPicker = localFolderProjectsEnabled() && 'showDirectoryPicker' in window;

    modalHost.innerHTML = `
      <div class="modal-overlay project-flow-modal-overlay is-selection-step" role="dialog" aria-modal="true" aria-labelledby="project-flow-modal-title">
        <div class="modal-dialog">
          <h2 id="project-flow-modal-title" class="modal-title">Create Project</h2>
          <div id="project-flow-modal-body" class="modal-body">
            <p>Choose where to save your new project:</p>
            <div class="modal-options">
              ${hasDirectoryPicker ? `
                <button type="button" class="ui-button ui-button--modal ui-button--full" id="btn-modal-new-dir">
                  <span class="ui-button-icon">📁</span> Local folder
                </button>
              ` : ''}
              <div class="modal-option-group">
                <button type="button" class="ui-button ui-button--modal ui-button--full" id="btn-modal-new-opfs">
                  <span class="ui-button-icon">☁️</span> Browser storage
                </button>
                <input type="text" id="input-opfs-name" class="input-text project-flow-modal-name-field" placeholder="Project name (e.g. My Draft)" />
                <button type="button" class="ui-button ui-button--modal ui-button--full ui-button--primary project-flow-modal-name-submit" id="btn-modal-new-opfs-confirm">Create</button>
              </div>
            </div>
          </div>
          <div id="project-flow-modal-actions" class="modal-actions">
            <button type="button" class="ui-button ui-button--modal" id="btn-modal-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;

    const cleanup = () => {
      modalHost.innerHTML = '';
    };

    const btnCancel = modalHost.querySelector('#btn-modal-cancel') as HTMLButtonElement;
    btnCancel.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    const btnDir = modalHost.querySelector('#btn-modal-new-dir') as HTMLButtonElement | null;
    if (btnDir) {
      btnDir.addEventListener('click', () => {
        cleanup();
        resolve({ action: 'directory' });
      });
    }

    const btnOpfs = modalHost.querySelector('#btn-modal-new-opfs') as HTMLButtonElement;
    const inputOpfsName = modalHost.querySelector('#input-opfs-name') as HTMLInputElement;
    const btnOpfsConfirm = modalHost.querySelector('#btn-modal-new-opfs-confirm') as HTMLButtonElement;

    const setStep = (step: 'selection' | 'name-entry'): void => {
      const overlay = modalHost.querySelector<HTMLElement>('.project-flow-modal-overlay');
      if (!overlay) return;
      const isNameEntry = step === 'name-entry';
      overlay.classList.toggle('is-selection-step', !isNameEntry);
      overlay.classList.toggle('is-name-entry-step', isNameEntry);
      if (isNameEntry) inputOpfsName.focus();
    };

    btnOpfs.addEventListener('click', () => {
      setStep('name-entry');
    });

    btnOpfsConfirm.addEventListener('click', () => {
      const name = inputOpfsName.value.trim() || 'Untitled Project';
      cleanup();
      resolve({ action: 'opfs', name });
    });

    inputOpfsName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = inputOpfsName.value.trim() || 'Untitled Project';
        cleanup();
        resolve({ action: 'opfs', name });
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    });
  });
}

/**
 * Asks where to open a document from. The recent-projects list lives on the welcome screen, so this dialog offers
 * only the two places a document can come from. Browser storage is a placeholder until it is redeveloped.
 */
export function showOpenProjectModal(): Promise<
  | { action: 'open-in-place' }
  | { action: 'import-backup'; file: File }
  | null
> {
  return new Promise((resolve) => {
    const modalHost = document.getElementById('project-flow-modal');
    if (!modalHost) return resolve(null);

    // Browsers without the file picker that edits in place (Safari) get a copy instead.
    const openInPlace = canOpenInPlace();

    modalHost.innerHTML = `
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="project-flow-modal-title">
        <div class="modal-dialog">
          <h2 id="project-flow-modal-title" class="modal-title">Open Document</h2>
          <div id="project-flow-modal-body" class="modal-body">
            <p>Choose where the document is:</p>
            <div class="modal-options">
              ${openInPlace ? `
                <button type="button" class="ui-button ui-button--modal ui-button--full" id="btn-modal-open-file">
                  <span class="ui-button-icon">💻</span> Local computer (.cwdoc)
                </button>
              ` : `
                <button type="button" class="ui-button ui-button--modal ui-button--full" id="btn-modal-import-backup">
                  <span class="ui-button-icon">💻</span> Local computer (.cwdoc, opened as a copy)
                </button>
                <input type="file" id="input-import-backup" accept=".cwdoc" hidden>
              `}
              <button type="button" class="ui-button ui-button--modal ui-button--full" id="btn-modal-browser-storage" disabled>
                <span class="ui-button-icon">☁️</span> Browser storage (coming later)
              </button>
            </div>
          </div>
          <div id="project-flow-modal-actions" class="modal-actions">
            <button type="button" class="ui-button ui-button--modal" id="btn-modal-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;

    const cleanup = () => {
      modalHost.innerHTML = '';
    };

    const btnCancel = modalHost.querySelector('#btn-modal-cancel') as HTMLButtonElement;
    btnCancel.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    if (openInPlace) {
      const openFileButton = modalHost.querySelector('#btn-modal-open-file') as HTMLButtonElement;
      openFileButton.addEventListener('click', () => {
        cleanup();
        resolve({ action: 'open-in-place' });
      });
    } else {
      const importButton = modalHost.querySelector('#btn-modal-import-backup') as HTMLButtonElement;
      const importInput = modalHost.querySelector('#input-import-backup') as HTMLInputElement;
      importButton.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', () => {
        const file = importInput.files?.[0];
        if (!file) return;
        cleanup();
        resolve({ action: 'import-backup', file });
      });
    }
  });
}
