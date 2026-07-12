import type { FileNode } from '../state';
import { getBaseName, getParentPath, normalizeExplorerPath } from './path-utils';

export type ExplorerTreeNode = {
  path: string;
  isDir: boolean;
  children: ExplorerTreeNode[];
  sourceIndex: number;
  pageBreak?: boolean;
};

export function sortSectionsByHierarchy(sections: FileNode[], preferredOrder: string[]): FileNode[] {
  const preferredIndex = new Map<string, number>();
  preferredOrder.forEach((entry, index) => {
    const normalized = normalizeExplorerPath(entry);
    if (!preferredIndex.has(normalized)) preferredIndex.set(normalized, index);
  });

  const normalizedSections: FileNode[] = [];
  const sourceIndex = new Map<string, number>();
  for (const section of sections) {
    const path = normalizeExplorerPath(section.path);
    if (!path || sourceIndex.has(path)) continue;
    sourceIndex.set(path, normalizedSections.length);
    normalizedSections.push({ ...section, path });
  }

  const sectionPaths = new Set(normalizedSections.map(section => section.path));
  const childrenByParent = new Map<string, FileNode[]>();
  const roots: FileNode[] = [];

  for (const section of normalizedSections) {
    const parentPath = getParentPath(section.path);
    if (parentPath && sectionPaths.has(parentPath)) {
      const siblings = childrenByParent.get(parentPath) || [];
      siblings.push(section);
      childrenByParent.set(parentPath, siblings);
    } else {
      roots.push(section);
    }
  }

  const rank = (section: FileNode) => preferredIndex.get(section.path)
    ?? preferredOrder.length + sourceIndex.get(section.path)!;
  const sortSiblings = (siblings: FileNode[]) => {
    siblings.sort((a, b) => {
      const rankDifference = rank(a) - rank(b);
      if (rankDifference !== 0) return rankDifference;
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return getBaseName(a.path).localeCompare(getBaseName(b.path), undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  const ordered: FileNode[] = [];
  const visit = (siblings: FileNode[]) => {
    sortSiblings(siblings);
    for (const section of siblings) {
      ordered.push(section);
      visit(childrenByParent.get(section.path) || []);
    }
  };

  visit(roots);
  return ordered;
}

export function buildExplorerTree(sections: FileNode[]): ExplorerTreeNode[] {
  const nodes = new Map<string, ExplorerTreeNode>();

  const getOrCreate = (path: string, isDir: boolean, sourceIndex: number, pageBreak?: boolean): ExplorerTreeNode => {
    const normalized = normalizeExplorerPath(path);
    let node = nodes.get(normalized);
    if (!node) {
      node = {
        path: normalized,
        isDir,
        children: [],
        sourceIndex,
        pageBreak
      };
      nodes.set(normalized, node);
    } else {
      node.isDir = node.isDir || isDir;
      node.sourceIndex = Math.min(node.sourceIndex, sourceIndex);
      if (pageBreak !== undefined) node.pageBreak = pageBreak;
    }
    return node;
  };

  sections.forEach((section, index) => {
    const normalized = normalizeExplorerPath(section.path);
    getOrCreate(normalized, section.isDir, index, section.pageBreak);

    let parent = getParentPath(normalized);
    while (parent) {
      getOrCreate(parent, true, index);
      parent = getParentPath(parent);
    }
  });

  const roots: ExplorerTreeNode[] = [];
  nodes.forEach(node => {
    node.children = [];
  });

  nodes.forEach(node => {
    const parentPath = getParentPath(node.path);
    const parent = parentPath ? nodes.get(parentPath) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (a: ExplorerTreeNode, b: ExplorerTreeNode) => {
    if (a.sourceIndex !== b.sourceIndex) return a.sourceIndex - b.sourceIndex;
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return getBaseName(a.path).localeCompare(getBaseName(b.path), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  };

  const sortTree = (nodesToSort: ExplorerTreeNode[]) => {
    nodesToSort.sort(sortNodes);
    nodesToSort.forEach(node => sortTree(node.children));
  };

  sortTree(roots);
  return roots;
}

/**
 * Hides a storage-only root directory from explorer views. Section paths still
 * retain their `sections/` prefix for workspace operations.
 */
export function getExplorerDisplayRoots(sections: FileNode[], storageRoot = 'sections'): ExplorerTreeNode[] {
  const roots = buildExplorerTree(sections);
  return roots.length === 1 && roots[0].isDir && roots[0].path === storageRoot
    ? roots[0].children
    : roots;
}
