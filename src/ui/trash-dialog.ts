import type { TrashItem, TrashRestoreResult } from '../platform/types';
import { showConfirmDialog } from './confirm-dialog';

/** What the trash dialog needs from the open project. */
export interface TrashDialogActions {
  list(): Promise<TrashItem[]>;
  restore(id: string): Promise<TrashRestoreResult>;
  /** Removes one item for good, or every item when no id is given. */
  purge(id?: string): Promise<boolean>;
}

const describeDeletion = (deletedAt: number): string => (
  deletedAt > 0 ? `Deleted ${new Date(deletedAt).toLocaleString()}` : 'Deleted at an unknown time'
);

/**
 * Shows the project's trash: each deleted section or folder can be restored to where it was, or deleted for
 * good, and the trash can be emptied. Resolves when the dialog closes. Results are announced in a status line.
 */
export async function showTrashDialog(actions: TrashDialogActions): Promise<void> {
  const modalHost = document.getElementById('project-flow-modal');
  if (!modalHost) return;

  await new Promise<void>(resolve => {
    let items: TrashItem[] = [];
    let message = '';

    const close = () => {
      modalHost.innerHTML = '';
      resolve();
    };

    const render = (focusId?: string) => {
      modalHost.innerHTML = '';
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'trash-dialog-title');

      const dialog = document.createElement('div');
      dialog.className = 'modal-dialog';
      const heading = document.createElement('h2');
      heading.id = 'trash-dialog-title';
      heading.className = 'modal-title';
      heading.textContent = 'Trash';

      const body = document.createElement('div');
      body.className = 'modal-body';
      const intro = document.createElement('p');
      intro.textContent = items.length === 0
        ? 'The trash is empty.'
        : 'Deleted sections stay here until you delete them for good. Restore puts a section back where it was.';
      const status = document.createElement('p');
      status.id = 'trash-dialog-status';
      status.className = 'trash-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = message;
      body.append(intro, status);

      if (items.length > 0) {
        const list = document.createElement('ul');
        list.className = 'trash-list';
        list.setAttribute('aria-label', 'Deleted items');
        for (const item of items) {
          const row = document.createElement('li');
          row.className = 'trash-item';
          row.dataset.trashId = item.id;
          const text = document.createElement('div');
          text.className = 'trash-item-text';
          const name = document.createElement('span');
          name.className = 'trash-item-name';
          name.textContent = item.kind === 'folder' ? `${item.name} (folder)` : item.name;
          const detail = document.createElement('span');
          detail.className = 'trash-item-detail';
          detail.textContent = `${item.originalPath} · ${describeDeletion(item.deletedAt)}`;
          text.append(name, detail);

          const restore = document.createElement('button');
          restore.type = 'button';
          restore.className = 'ui-button ui-button--modal';
          restore.dataset.action = 'restore';
          restore.id = `trash-restore-${item.id}`;
          restore.textContent = 'Restore';
          restore.setAttribute('aria-label', `Restore ${item.name}`);
          restore.addEventListener('click', () => void restoreItem(item));

          const purge = document.createElement('button');
          purge.type = 'button';
          purge.className = 'ui-button ui-button--modal ui-button--danger';
          purge.dataset.action = 'purge';
          purge.id = `trash-purge-${item.id}`;
          purge.textContent = 'Delete forever';
          purge.setAttribute('aria-label', `Delete ${item.name} forever`);
          purge.addEventListener('click', () => void purgeItem(item));

          row.append(text, restore, purge);
          list.append(row);
        }
        body.append(list);
      }

      const footer = document.createElement('div');
      footer.className = 'modal-actions';
      if (items.length > 0) {
        const empty = document.createElement('button');
        empty.type = 'button';
        empty.id = 'trash-empty';
        empty.className = 'ui-button ui-button--modal ui-button--danger';
        empty.textContent = 'Empty trash';
        empty.addEventListener('click', () => void emptyTrash());
        footer.append(empty);
      }
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.id = 'trash-close';
      closeButton.className = 'ui-button ui-button--modal ui-button--primary';
      closeButton.textContent = 'Close';
      closeButton.addEventListener('click', close);
      footer.append(closeButton);

      dialog.append(heading, body, footer);
      overlay.append(dialog);
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
      modalHost.append(overlay);
      ((focusId ? document.getElementById(focusId) : null) ?? closeButton).focus();
    };

    const refresh = async (note: string, focusId?: string) => {
      items = await actions.list();
      message = note;
      render(focusId ?? (items[0] ? `trash-restore-${items[0].id}` : 'trash-close'));
    };

    const restoreItem = async (item: TrashItem) => {
      const result = await actions.restore(item.id);
      if (!result.success) {
        await refresh(result.reason ?? `${item.name} could not be restored.`);
        return;
      }
      const renamed = result.restoredPath !== undefined && result.restoredPath !== item.originalPath;
      await refresh(renamed
        ? `Restored ${item.name} as ${result.restoredPath}, because ${item.originalPath} is in use.`
        : `Restored ${item.name} to ${item.originalPath}.`);
    };

    const purgeItem = async (item: TrashItem) => {
      const proceed = await showConfirmDialog({
        title: 'Delete forever',
        message: `Delete ${item.name} for good? This cannot be undone.`,
        confirmLabel: 'Delete forever',
        cancelLabel: 'Keep',
        tone: 'danger'
      });
      if (!proceed) {
        await refresh('', `trash-purge-${item.id}`);
        return;
      }
      await refresh(await actions.purge(item.id) ? `Deleted ${item.name} for good.` : `${item.name} could not be deleted.`);
    };

    const emptyTrash = async () => {
      const proceed = await showConfirmDialog({
        title: 'Empty trash',
        message: `Delete all ${items.length} item${items.length === 1 ? '' : 's'} in the trash for good? This cannot be undone.`,
        confirmLabel: 'Empty trash',
        cancelLabel: 'Keep',
        tone: 'danger'
      });
      if (!proceed) {
        await refresh('', 'trash-empty');
        return;
      }
      await refresh(await actions.purge() ? 'The trash is empty.' : 'The trash could not be emptied.');
    };

    void refresh('');
  });
}
