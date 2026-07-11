import type { FileNode } from '../types';
import type { SectionPlacement } from './types';
import { getBaseName, getParentPath, isDescendantPath, normalizeExplorerPath, replacePathPrefix } from '../utils/path-utils';

export function canonicalizeSectionOrder(entries: FileNode[], preferredOrder: string[] = []): string[] {
  const preferredIndex = new Map<string, number>();
  preferredOrder.forEach((entry, index) => {
    const normalized = normalizeExplorerPath(entry);
    if (normalized && !preferredIndex.has(normalized)) {
      preferredIndex.set(normalized, index);
    }
  });

  const uniqueEntries: Array<{ path: string; isDir: boolean }> = [];
  const entryIndex = new Map<string, number>();
  for (const entry of entries) {
    const normalized = normalizeExplorerPath(entry.path);
    if (!normalized || entryIndex.has(normalized)) continue;
    entryIndex.set(normalized, uniqueEntries.length);
    uniqueEntries.push({ path: normalized, isDir: Boolean(entry.isDir) });
  }

  const entryPaths = new Set(uniqueEntries.map(entry => entry.path));
  const children = new Map<string, Array<{ path: string; isDir: boolean }>>();
  const roots: Array<{ path: string; isDir: boolean }> = [];

  for (const entry of uniqueEntries) {
    const parent = getParentPath(entry.path);
    if (parent && entryPaths.has(parent)) {
      const siblings = children.get(parent) || [];
      siblings.push(entry);
      children.set(parent, siblings);
    } else {
      roots.push(entry);
    }
  }

  const rank = (entry: { path: string; isDir: boolean }) => preferredIndex.get(entry.path)
    ?? preferredOrder.length + (entryIndex.get(entry.path) ?? 0);

  const flattened: string[] = [];
  const visit = (entriesToVisit: Array<{ path: string; isDir: boolean }>) => {
    entriesToVisit.sort((a, b) => {
      const rankDifference = rank(a) - rank(b);
      if (rankDifference !== 0) return rankDifference;
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const entry of entriesToVisit) {
      flattened.push(entry.path);
      visit(children.get(entry.path) || []);
    }
  };

  visit(roots);
  return flattened;
}

export function calculateSectionMove(
  entries: FileNode[],
  preferredOrder: string[],
  sourcePath: string,
  targetPath: string | null,
  placement: SectionPlacement
): { source: string; destination: string; order: string[] } | null {
  const source = normalizeExplorerPath(sourcePath);
  const target = targetPath ? normalizeExplorerPath(targetPath) : null;
  const validPlacements = new Set<SectionPlacement>(['inside', 'before', 'after', 'root']);
  if (!source || !validPlacements.has(placement)) return null;
  if (placement !== 'root' && !target) return null;
  if (target === source || (target && isDescendantPath(source, target))) return null;

  const entryByPath = new Map(entries.map(entry => [normalizeExplorerPath(entry.path), entry]));
  const sourceEntry = entryByPath.get(source);
  const targetEntry = target ? entryByPath.get(target) : null;
  if (!sourceEntry || (placement !== 'root' && !targetEntry)) return null;
  if (placement === 'inside' && !targetEntry?.isDir) return null;
  const requiredTarget = target ?? undefined;

  const destinationParent = placement === 'root'
    ? null
    : placement === 'inside'
      ? requiredTarget!
      : getParentPath(requiredTarget!);
  const destination = destinationParent
    ? `${destinationParent}/${getBaseName(source)}`
    : getBaseName(source);

  if (destination !== source && entryByPath.has(destination)) return null;

  const canonicalOrder = canonicalizeSectionOrder(entries, preferredOrder);
  const movedBlock = canonicalOrder
    .filter(entry => entry === source || isDescendantPath(source, entry))
    .map(entry => replacePathPrefix(entry, source, destination));
  const remaining = canonicalOrder.filter(entry => entry !== source && !isDescendantPath(source, entry));

  let insertionIndex = remaining.length;
  if (placement !== 'root') {
    if (placement === 'before') {
      insertionIndex = remaining.indexOf(requiredTarget!);
    } else {
      const targetBlockEnd = remaining.findLastIndex(
        entry => entry === requiredTarget || isDescendantPath(requiredTarget!, entry)
      );
      insertionIndex = targetBlockEnd + 1;
    }
    if (insertionIndex < 0) return null;
  }

  const order = [...remaining];
  order.splice(insertionIndex, 0, ...movedBlock);
  return { source, destination, order };
}
