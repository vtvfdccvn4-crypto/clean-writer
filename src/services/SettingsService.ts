import { state } from '../state';
import type { PageSetup, TypographySetup, ListSetup, ProjectMetadata, CustomStyle, CustomBlockStyle, TableSetup } from '../types';
import type { WorkspaceSession } from '../platform/types';
import { PROJECT_SETTINGS_SCHEMA_VERSION } from './project-settings';
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
        projectMetadata: settings.projectMetadata,
        customStyles: settings.customStyles,
        customBlockStyles: settings.customBlockStyles
      });
    } catch (e) {
      console.error('Failed to load settings.json', e);
      throw e;
    } finally {
      previewMetrics.recordSettingsSnapshotLoad(performance.now() - started);
    }
  },

  async saveSettings(
    session: WorkspaceSession,
    pageSetup?: PageSetup, 
    typographySetup?: TypographySetup, 
    listSetup?: ListSetup,
    projectMetadata?: ProjectMetadata,
    customStyles?: CustomStyle[],
    customBlockStyles?: CustomBlockStyle[],
    tableSetup?: TableSetup
  ): Promise<void> {
    try {
      await session.mutateSettings({
        type: 'patch',
        values: {
          schemaVersion: PROJECT_SETTINGS_SCHEMA_VERSION,
          pageSetup: pageSetup ?? state.current.pageSetup,
          typographySetup: typographySetup ?? state.current.typographySetup,
          listSetup: listSetup ?? state.current.listSetup,
          tableSetup: tableSetup ?? state.current.tableSetup,
          projectMetadata: projectMetadata ?? state.current.projectMetadata,
          customStyles: customStyles ?? state.current.customStyles,
          customBlockStyles: customBlockStyles ?? state.current.customBlockStyles
        }
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
