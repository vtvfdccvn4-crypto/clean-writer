import type { ProjectSettingsData } from '../types';
import { normalizeExplorerPath, replacePathPrefix } from '../utils/path-utils';

const PATH_SETTING_KEYS = [
  'order',
  'pageBreaks',
  'hiddenHeaders',
  'hiddenFooters',
  'numberedHeadings',
  'tocSections'
] as const;

function uniqueProjectPaths(values: string[] | undefined): string[] {
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

/**
 * The settings entries for a path and everything under it, taken when the path is deleted so that a
 * restore can put them back: its place in the project order, and its page breaks, hidden headers,
 * numbering and table-of-contents flags.
 */
export interface PathSettingsSnapshot {
  /** Where the first removed entry stood in the order, or -1 when none was listed. */
  readonly orderIndex: number;
  /** For each path setting, the entries that were equal to or under the path. */
  readonly paths: Readonly<Partial<Record<(typeof PATH_SETTING_KEYS)[number], readonly string[]>>>;
}

export const EMPTY_PATH_SETTINGS: PathSettingsSnapshot = { orderIndex: -1, paths: {} };

export function snapshotSettingsPaths(settings: ProjectSettingsData, path: string): PathSettingsSnapshot {
  const prefix = `${path}/`;
  const covered = (entry: string) => entry === path || entry.startsWith(prefix);
  const paths: Partial<Record<(typeof PATH_SETTING_KEYS)[number], string[]>> = {};
  for (const key of PATH_SETTING_KEYS) {
    const entries = uniqueProjectPaths(settings[key]).filter(covered);
    if (entries.length > 0) paths[key] = entries;
  }
  const order = uniqueProjectPaths(settings.order);
  return { orderIndex: order.findIndex(covered), paths };
}

/** Puts a deleted path's settings back, under its original path or the path it was restored to. */
export function restoreSettingsPaths(settings: ProjectSettingsData, snapshot: PathSettingsSnapshot, oldPath: string, newPath: string): void {
  for (const key of PATH_SETTING_KEYS) {
    const restored = (snapshot.paths[key] ?? []).map(entry => replacePathPrefix(entry, oldPath, newPath));
    if (restored.length === 0) continue;
    const current = uniqueProjectPaths(settings[key]);
    const missing = restored.filter(entry => !current.includes(entry));
    if (key === 'order' && snapshot.orderIndex >= 0) {
      current.splice(Math.min(snapshot.orderIndex, current.length), 0, ...missing);
    } else {
      current.push(...missing);
    }
    settings[key] = current;
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
