import type { ProjectSettingsData, ProjectSettingsMutation } from '../types';
import { normalizeExplorerPath } from '../utils/path-utils';
import { removeSettingsPath, replaceSettingsPath } from '../platform/project-paths';

/** Applies one project-settings command to a caller-owned mutable snapshot. */
export function applyProjectSettingsMutation(
  settings: ProjectSettingsData,
  mutation: ProjectSettingsMutation
): void {
  if (mutation.type === 'patch') {
    Object.assign(settings, mutation.values);
    return;
  }

  if (mutation.type === 'append-order') {
    const path = normalizeExplorerPath(mutation.path);
    if (path && !settings.order.includes(path)) settings.order.push(path);
    return;
  }

  if (mutation.type === 'set-path-flag') {
    const path = normalizeExplorerPath(mutation.path);
    const paths = settings[mutation.key];
    const enabled = mutation.enabled ?? !paths.includes(path);
    if (enabled && path && !paths.includes(path)) paths.push(path);
    if (!enabled) {
      const index = paths.indexOf(path);
      if (index !== -1) paths.splice(index, 1);
    }
    return;
  }

  if (mutation.type === 'replace-path') {
    replaceSettingsPath(settings, normalizeExplorerPath(mutation.oldPath), normalizeExplorerPath(mutation.newPath));
    return;
  }

  removeSettingsPath(settings, normalizeExplorerPath(mutation.path));
}
