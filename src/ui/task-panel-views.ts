import { state } from '../state';
import type { EditorManager } from './editor-manager';
import { getExplorerCreationParentPath, renderTaskExplorer } from './task-explorer';
import { renderTaskImages } from './task-images';
import type { AssetResolver } from '../platform/types';
import { projectSession } from '../services/ProjectSessionStore';
import { showNotice } from './components/Notice';
import { showInputDialog } from './input-dialog';

type TaskPanelView = 'explorer' | 'images' | 'outline' | null;
const OUTLINE_ACTIVATED_EVENT = 'clear-writer-task-outline-activated';

export function initTaskPanelViews(editorManager: EditorManager, assetResolver: AssetResolver): void {
  const explorerButton = document.getElementById('btn-activity-explorer');
  const imagesButton = document.getElementById('btn-activity-images');
  const outlineButton = document.getElementById('btn-activity-outline');
  const explorerView = document.getElementById('task-explorer-view');
  const explorerContent = document.getElementById('task-explorer-content');
  const explorerEmpty = document.getElementById('task-explorer-empty');
  const imagesView = document.getElementById('task-images-view');
  const imagesContent = document.getElementById('task-images-content');
  const imagesEmpty = document.getElementById('task-images-empty');
  const outlineView = document.querySelector<HTMLElement>('#task-panel .outline-section');
  const footer = document.querySelector<HTMLElement>('#task-panel .task-footer');
  const taskPanel = document.getElementById('task-panel');
  const taskPanelResizer = document.getElementById('task-panel-resizer');
  const workspace = document.querySelector<HTMLElement>('.workspace');
  const title = document.getElementById('task-panel-title');
  const treeActions = document.getElementById('task-panel-actions');
  const newFolderButton = document.getElementById('btn-task-new-folder') as HTMLButtonElement | null;
  const newSectionButton = document.getElementById('btn-task-new-section') as HTMLButtonElement | null;

  if (!explorerButton || !imagesButton || !outlineButton || !explorerView || !explorerContent || !explorerEmpty || !imagesView || !imagesContent || !imagesEmpty || !outlineView || !footer) return;
  let activeView: TaskPanelView = null;
  let panelVisible = true;

  const setPressed = (button: HTMLElement, pressed: boolean) => {
    button.classList.toggle('is-active', pressed);
    button.setAttribute('aria-pressed', String(pressed));
  };
  const setTitle = (text: string) => { if (title) title.textContent = text; };
  const setTreeActionsVisible = (visible: boolean) => treeActions?.classList.toggle('hidden', !visible);
  const hideAll = () => {
    explorerView.classList.add('hidden');
    imagesView.classList.add('hidden');
    outlineView.classList.add('hidden');
    footer.classList.add('hidden');
    footer.setAttribute('aria-hidden', 'true');
    setPressed(explorerButton, false);
    setPressed(imagesButton, false);
    setPressed(outlineButton, false);
    setTreeActionsVisible(false);
  };
  const renderActiveView = () => {
    if (activeView === 'explorer') renderTaskExplorer(explorerContent, explorerEmpty, editorManager);
    if (activeView === 'images') renderTaskImages(imagesContent, imagesEmpty, assetResolver, markdown => editorManager.insertTextAtCursor(markdown));
  };
  const setPanelVisible = (visible: boolean) => {
    panelVisible = visible;
    taskPanel?.classList.toggle('hidden', !visible);
    taskPanelResizer?.classList.toggle('hidden', !visible);
    workspace?.classList.toggle('task-panel-hidden', !visible);
    if (!visible) hideAll();
    else if (activeView) { hideAll(); renderActiveView(); }
  };
  const showView = (view: TaskPanelView) => {
    activeView = view;
    setPanelVisible(true);
    hideAll();
    if (view === 'explorer') {
      setTitle('Project tree');
      setTreeActionsVisible(true);
      explorerView.classList.remove('hidden');
      setPressed(explorerButton, true);
      renderTaskExplorer(explorerContent, explorerEmpty, editorManager);
    } else if (view === 'images') {
      setTitle('Images');
      imagesView.classList.remove('hidden');
      setPressed(imagesButton, true);
      renderTaskImages(imagesContent, imagesEmpty, assetResolver, markdown => editorManager.insertTextAtCursor(markdown));
    } else if (view === 'outline') {
      setTitle('Document outline');
      outlineView.classList.remove('hidden');
      footer.classList.remove('hidden');
      footer.setAttribute('aria-hidden', 'false');
      setPressed(outlineButton, true);
      document.dispatchEvent(new CustomEvent(OUTLINE_ACTIVATED_EVENT));
    }
  };
  const hideView = () => { activeView = null; setPanelVisible(false); setTitle('Tasks'); };

  const createTreeItem = async (kind: 'folder' | 'section') => {
    const label = kind === 'folder' ? 'folder' : 'section file';
    const parentPath = getExplorerCreationParentPath();
    const name = await showInputDialog({
      title: `New ${label}${parentPath ? ' in selected folder' : ''}`,
      initialValue: kind === 'folder' ? 'New folder' : 'New section',
      confirmLabel: 'Create',
    });
    if (!name) return;
    const path = parentPath ? `${parentPath}/${name}` : name;
    const button = kind === 'folder' ? newFolderButton : newSectionButton;
    if (button) button.disabled = true;
    try {
      const created = kind === 'folder'
        ? await projectSession.createFolder(path)
        : await projectSession.createSection(path);
      if (!created) showNotice(`Could not create ${label}. A file or folder with that path may already exist.`, 'error');
    } catch (error) {
      console.error(`Failed to create ${label}`, error);
      showNotice(`Could not create ${label}.`, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  };

  explorerButton.addEventListener('click', () => activeView === 'explorer' && panelVisible ? hideView() : showView('explorer'));
  imagesButton.addEventListener('click', () => activeView === 'images' && panelVisible ? hideView() : showView('images'));
  outlineButton.addEventListener('click', () => activeView === 'outline' && panelVisible ? hideView() : showView('outline'));
  newFolderButton?.addEventListener('click', () => { void createTreeItem('folder'); });
  newSectionButton?.addEventListener('click', () => { void createTreeItem('section'); });
  state.onProjectTreeChanged(() => { if (activeView === 'explorer' || activeView === 'images') renderActiveView(); });
  state.onProjectSnapshotChanged(() => {
    if (!state.current.projectRef) return;
    if (activeView !== 'explorer' || !panelVisible) showView('explorer');
    else renderTaskExplorer(explorerContent, explorerEmpty, editorManager);
  });
  state.onProjectChanged(() => {
    if (state.current.projectRef) return;
    activeView = null;
    panelVisible = true;
    hideAll();
    setTitle('Tasks');
    workspace?.classList.remove('task-panel-hidden');
    taskPanel?.classList.remove('hidden');
    taskPanelResizer?.classList.remove('hidden');
    explorerContent.innerHTML = '';
    imagesContent.innerHTML = '';
    explorerEmpty.classList.remove('hidden');
    imagesEmpty.classList.remove('hidden');
  });
  if (state.current.projectRef) showView('explorer');
}
