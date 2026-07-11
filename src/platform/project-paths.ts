import type { ProjectSettingsData } from '../types';
import { normalizeExplorerPath, replacePathPrefix } from '../utils/path-utils';

export const PATH_SETTING_KEYS = [
  'order',
  'pageBreaks',
  'hiddenHeaders',
  'hiddenFooters',
  'numberedHeadings',
  'tocSections'
] as const;

export function uniqueProjectPaths(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeExplorerPath).filter(Boolean))];
}

export function replaceSettingsPath(settings: ProjectSettingsData, oldPath: string, newPath: string): void {
  for (const key of PATH_SETTING_KEYS) {
    settings[key] = uniqueProjectPaths(settings[key]).map(entry => replacePathPrefix(entry, oldPath, newPath));
  }
}

export function removeSettingsPath(settings: ProjectSettingsData, removedPath: string): void {
  const prefix = `${removedPath}/`;
  for (const key of PATH_SETTING_KEYS) {
    settings[key] = uniqueProjectPaths(settings[key]).filter(entry => entry !== removedPath && !entry.startsWith(prefix));
  }
}

export function resolveSectionPath(path: string): string {
  const normalized = normalizeExplorerPath(path);
  if (!normalized) return normalized;
  return normalized.startsWith('sections/') ? normalized : `sections/${normalized}`;
}

export function resolveImagePath(path: string): string {
  const normalized = normalizeExplorerPath(path);
  if (!normalized) return normalized;
  if (normalized.startsWith('assets/')) return normalized;
  return normalized.startsWith('images/') ? normalized : `images/${normalized}`;
}
