import type { Platform } from '../platform/types';
import type { ProjectSettingsPatch } from '../types';
import { initCustomStylesDrawer } from '../ui/custom-styles-setup';
import { setupEditorSettingsDrawer } from '../ui/editor-settings-setup';
import { initListsDrawer } from '../ui/lists-setup';
import { initPageSetupDrawer } from '../ui/page-setup';
import { initProjectMetadataDrawer } from '../ui/project-metadata';
import { initSpecialHeadingsDrawer } from '../ui/special-headings-setup';
import { initTablesDrawer } from '../ui/tables-setup';
import { initTocSetupDrawer } from '../ui/toc-setup';
import { initTypographyDrawer } from '../ui/typography-setup';

/** Registers settings feature drawers with their shared project-settings writer. */
export function setupSettingsFeatures(
  platform: Platform,
  saveSettings: (patch: ProjectSettingsPatch) => Promise<void>
): void {
  initPageSetupDrawer(async (pageSetup) => saveSettings({ pageSetup }));
  initTocSetupDrawer(async (pageSetup) => saveSettings({ pageSetup }));
  initSpecialHeadingsDrawer(async (pageSetup) => saveSettings({ pageSetup }));
  initTypographyDrawer(async (typographySetup) => saveSettings({ typographySetup }));
  initListsDrawer(async (listSetup) => saveSettings({ listSetup }));
  initTablesDrawer(async (tableSetup) => saveSettings({ tableSetup }));
  initProjectMetadataDrawer(async (projectMetadata) => saveSettings({ projectMetadata }));
  initCustomStylesDrawer(platform, async (customStyles, customBlockStyles) => saveSettings({ customStyles, customBlockStyles }));
  setupEditorSettingsDrawer(async (editorSetup) => saveSettings({ editorSetup }));
}
