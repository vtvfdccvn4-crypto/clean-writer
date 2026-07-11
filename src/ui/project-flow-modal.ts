import type { WorkspaceRef } from '../platform';

export function escapeProjectFlowText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showNewProjectModal(): Promise<
  | { action: 'directory' }
  | { action: 'opfs'; name: string }
  | null
> {
  return new Promise((resolve) => {
    const modalHost = document.getElementById('project-flow-modal');
    if (!modalHost) return resolve(null);

    const hasDirectoryPicker = 'showDirectoryPicker' in window;

    modalHost.innerHTML = `
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="project-flow-modal-title">
        <div class="modal-dialog">
          <h2 id="project-flow-modal-title" class="modal-title">Create Project</h2>
          <div id="project-flow-modal-body" class="modal-body">
            <p>Choose where to save your new project:</p>
            <div class="modal-options">
              ${hasDirectoryPicker ? `
                <button type="button" class="btn btn-outline" id="btn-modal-new-dir">
                  <span class="btn-icon">📁</span> Local folder
                </button>
              ` : ''}
              <div class="modal-option-group">
                <button type="button" class="btn btn-outline" id="btn-modal-new-opfs">
                  <span class="btn-icon">☁️</span> Browser storage
                </button>
                <input type="text" id="input-opfs-name" class="input-text" placeholder="Project name (e.g. My Draft)" style="display: none; margin-top: var(--space-xs);" />
                <button type="button" class="btn btn-primary" id="btn-modal-new-opfs-confirm" style="display: none; margin-top: var(--space-xs);">Create</button>
              </div>
            </div>
          </div>
          <div id="project-flow-modal-actions" class="modal-actions">
            <button type="button" class="btn btn-text" id="btn-modal-cancel">Cancel</button>
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

    btnOpfs.addEventListener('click', () => {
      btnOpfs.style.display = 'none';
      if (btnDir) btnDir.style.display = 'none';
      inputOpfsName.style.display = 'block';
      btnOpfsConfirm.style.display = 'block';
      inputOpfsName.focus();
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

export function showOpenProjectModal(recentWorkspaces: Array<{ref: WorkspaceRef, displayName: string, time: number}>): Promise<
  | { action: 'directory-picker' }
  | { action: 'open-ref'; ref: WorkspaceRef }
  | null
> {
  return new Promise((resolve) => {
    const modalHost = document.getElementById('project-flow-modal');
    if (!modalHost) return resolve(null);

    const hasDirectoryPicker = 'showDirectoryPicker' in window;

    const renderRecentItem = (entry: { ref: WorkspaceRef, displayName: string, time: number }, index: number) => {
      const icon = entry.ref.kind === 'directory' ? '📁' : '☁️';
      const kindLabel = entry.ref.kind === 'directory' ? 'Local folder' : 'Browser storage';
      return `
        <button type="button" class="btn btn-outline recent-item-btn" data-index="${index}">
          <span class="btn-icon">${icon}</span>
          <span class="recent-item-name">${escapeProjectFlowText(entry.displayName)}</span>
          <span class="recent-item-kind">${kindLabel}</span>
        </button>
      `;
    };

    modalHost.innerHTML = `
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="project-flow-modal-title">
        <div class="modal-dialog">
          <h2 id="project-flow-modal-title" class="modal-title">Open Project</h2>
          <div id="project-flow-modal-body" class="modal-body">
            ${recentWorkspaces.length > 0 ? `
              <p>Recent projects:</p>
              <div class="modal-recent-list">
                ${recentWorkspaces.map(renderRecentItem).join('')}
              </div>
            ` : '<p>No recent projects found.</p>'}
            
            ${hasDirectoryPicker ? `
              <div class="modal-divider"></div>
              <button type="button" class="btn btn-outline" id="btn-modal-open-dir">
                <span class="btn-icon">📁</span> Open a local folder...
              </button>
            ` : ''}
          </div>
          <div id="project-flow-modal-actions" class="modal-actions">
            <button type="button" class="btn btn-text" id="btn-modal-cancel">Cancel</button>
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

    const btnOpenDir = modalHost.querySelector('#btn-modal-open-dir') as HTMLButtonElement | null;
    if (btnOpenDir) {
      btnOpenDir.addEventListener('click', () => {
        cleanup();
        resolve({ action: 'directory-picker' });
      });
    }

    const recentBtns = modalHost.querySelectorAll('.recent-item-btn');
    recentBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const indexStr = btn.getAttribute('data-index');
        if (indexStr !== null) {
          const index = parseInt(indexStr, 10);
          const entry = recentWorkspaces[index];
          if (entry) {
            cleanup();
            resolve({ action: 'open-ref', ref: entry.ref });
          }
        }
      });
    });
  });
}
