import { state, type AppState } from '../state';
import type { ProjectSettingsPatch } from '../types';
import type { WorkspaceSession } from '../platform/types';
import { previewMetrics } from '../perf/preview-metrics';

function createSettingsService(appState: AppState) {
  const service = {
    async loadSettings(session: WorkspaceSession): Promise<void> {
      const started = performance.now();
      try {
        const settings = await session.readSettings();
        appState.commitSettingsSnapshot({
          pageSetup: settings.pageSetup,
          typographySetup: settings.typographySetup,
          listSetup: settings.listSetup,
          tableSetup: settings.tableSetup,
          imageSetup: settings.imageSetup,
          projectMetadata: settings.projectMetadata,
          customStyles: settings.customStyles,
          customBlockStyles: settings.customBlockStyles,
          editorSetup: settings.editorSetup
        });
      } catch (e) {
        console.error('Failed to load settings.json', e);
        throw e;
      } finally {
        previewMetrics.recordSettingsSnapshotLoad(performance.now() - started);
      }
    },

    async saveSettings(session: WorkspaceSession, patch: ProjectSettingsPatch): Promise<void> {
      try {
        await session.mutateSettings({
          type: 'patch',
          values: patch
        });
      } catch (e) {
        console.error('Failed to save settings.json', e);
        // Restore the last durable snapshot so the UI never claims settings that
        // were rejected by disk or the privileged settings repository.
        try {
          await service.loadSettings(session);
        } catch (reloadError) {
          console.error('Failed to restore settings after save failure', reloadError);
        }
        throw e;
      }
    }
  };
  return service;
}

export type SettingsServiceApi = ReturnType<typeof createSettingsService>;

const settingsServices = new WeakMap<AppState, SettingsServiceApi>();

/** The settings service that publishes to `appState`; one shared instance per state. */
export function settingsServiceFor(appState: AppState): SettingsServiceApi {
  let service = settingsServices.get(appState);
  if (!service) {
    service = createSettingsService(appState);
    settingsServices.set(appState, service);
  }
  return service;
}

export const SettingsService = settingsServiceFor(state);
