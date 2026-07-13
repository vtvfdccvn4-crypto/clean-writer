import { state } from '../../state';
import { getAncestorFolders, normalizeExplorerPath } from '../../utils/path-utils';

const collapsedFoldersByProject = new Map<string, Set<string>>();
const collapsedFoldersInitializedByProject = new Set<string>();
let activeProjectPath: string | null = null;

export function getCollapsedFoldersForActiveProject(): Set<string> {
  const projectPath = state.current.projectRef?.id || '';
  if (activeProjectPath !== projectPath) {
    activeProjectPath = projectPath;
    if (!collapsedFoldersByProject.has(projectPath)) {
      collapsedFoldersByProject.set(projectPath, new Set<string>());
    }
  }

  const collapsedFolders = collapsedFoldersByProject.get(projectPath)!;
  if (!collapsedFoldersInitializedByProject.has(projectPath)) {
    for (const section of state.current.sections) {
      if (section.isDir) {
        collapsedFolders.add(normalizeExplorerPath(section.path));
      }
    }
    collapsedFoldersInitializedByProject.add(projectPath);
  }

  return collapsedFolders;
}

export function setFolderCollapsed(path: string, collapsed: boolean) {
  const collapsedFolders = getCollapsedFoldersForActiveProject();
  const normalizedPath = normalizeExplorerPath(path);
  if (collapsed) {
    collapsedFolders.add(normalizedPath);
  } else {
    collapsedFolders.delete(normalizedPath);
  }
}

export function revealAncestorFolders(path: string): boolean {
  const collapsedFolders = getCollapsedFoldersForActiveProject();
  let changed = false;
  for (const folder of getAncestorFolders(path)) {
    if (collapsedFolders.delete(folder)) {
      changed = true;
    }
  }
  return changed;
}
