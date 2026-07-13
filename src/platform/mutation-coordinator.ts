import type { ProjectSettingsData } from '../types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export interface CoordinatedMutationOptions {
  readSettings(): Promise<ProjectSettingsData>;
  writeSettings(settings: ProjectSettingsData): Promise<void>;
  applyFilesystem(): Promise<void>;
  rollbackFilesystem(): Promise<void>;
  updateSettings(settings: ProjectSettingsData): void;
}

/**
 * Coordinates a filesystem mutation with its settings metadata using a
 * compensating transaction. Browser file-system handles do not provide a
 * cross-file transaction, so every caller must supply an inverse operation.
 */
export async function runCoordinatedMutation(
  options: CoordinatedMutationOptions
): Promise<boolean> {
  const originalSettings = await options.readSettings();
  let filesystemStarted = false;

  try {
    filesystemStarted = true;
    await options.applyFilesystem();

    const nextSettings = clone(originalSettings);
    options.updateSettings(nextSettings);
    await options.writeSettings(nextSettings);
    return true;
  } catch (error) {
    let rollbackError: unknown = null;

    try {
      await options.writeSettings(originalSettings);
    } catch (settingsError) {
      rollbackError = settingsError;
    }

    if (filesystemStarted) {
      try {
        await options.rollbackFilesystem();
      } catch (filesystemError) {
        rollbackError ??= filesystemError;
      }
    }

    if (rollbackError) {
      console.error('[WorkspaceMutation] rollback failed', { error, rollbackError });
    } else {
      console.warn('[WorkspaceMutation] mutation rolled back', error);
    }
    return false;
  }
}
