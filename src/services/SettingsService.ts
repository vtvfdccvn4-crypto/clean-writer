import { state } from '../state';
import type { ProjectSettingsPatch } from '../types';
import type { WorkspaceSession } from '../platform/types';
import { previewMetrics } from '../perf/preview-metrics';

export const SettingsService = {
  async loadSettings(session: WorkspaceSession): Promise<void> {
    const started = performance.now();
    try {
      const settings = await session.readSettings();
      state.commitSettingsSnapshot({
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
        await SettingsService.loadSettings(session);
      } catch (reloadError) {
        console.error('Failed to restore settings after save failure', reloadError);
      }
      throw e;
    }
  }
};
