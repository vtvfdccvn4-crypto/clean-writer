export interface InputDialogOptions {
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function showInputDialog(options: InputDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const modalHost = document.getElementById('project-flow-modal');
    if (!modalHost) return resolve(null);

    let settled = false;
    const confirm = () => {
      if (settled) return;
      settled = true;
      const value = input.value.trim();
      cleanup();
      resolve(value || null);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };

    modalHost.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'input-modal-title');

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    const heading = document.createElement('h2');
    heading.id = 'input-modal-title';
    heading.className = 'modal-title';
    heading.textContent = options.title;

    const body = document.createElement('div');
    body.className = 'modal-body';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-text project-flow-modal-name-field';
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.initialValue) input.value = options.initialValue;
    body.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'ui-button ui-button--modal';
    btnCancel.textContent = options.cancelLabel ?? 'Cancel';

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = 'ui-button ui-button--modal ui-button--primary';
    btnOk.textContent = options.confirmLabel ?? 'Create';

    actions.append(btnCancel, btnOk);
    dialog.append(heading, body, actions);
    overlay.appendChild(dialog);
    modalHost.appendChild(overlay);

    const cleanup = () => { modalHost.innerHTML = ''; };

    btnCancel.addEventListener('click', cancel);
    btnOk.addEventListener('click', confirm);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) cancel(); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); confirm(); }
      else if (event.key === 'Escape') cancel();
    });

    input.focus();
    input.select();
  });
}
