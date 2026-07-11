export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export function showConfirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const modalHost = document.getElementById('project-flow-modal');
    if (!modalHost) return resolve(false);

    const title = options.title;
    const message = options.message;
    const confirmLabel = options.confirmLabel || 'Confirm';
    const cancelLabel = options.cancelLabel || 'Cancel';
    const tone = options.tone || 'default';

    const btnConfirmClass = tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

    modalHost.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'confirm-modal-title');

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    const heading = document.createElement('h2');
    heading.id = 'confirm-modal-title';
    heading.className = 'modal-title';
    heading.textContent = title;

    const body = document.createElement('div');
    body.className = 'modal-body';

    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    body.appendChild(paragraph);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn btn-text';
    btnCancel.id = 'btn-confirm-cancel';
    btnCancel.textContent = cancelLabel;

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = btnConfirmClass;
    btnOk.id = 'btn-confirm-ok';
    btnOk.textContent = confirmLabel;

    actions.append(btnCancel, btnOk);
    dialog.append(heading, body, actions);
    overlay.appendChild(dialog);
    modalHost.appendChild(overlay);

    const cleanup = () => {
      modalHost.innerHTML = '';
    };

    btnCancel.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    btnOk.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    });

    // Simple accessibility: focus the confirm button by default
    btnOk.focus();
  });
}
