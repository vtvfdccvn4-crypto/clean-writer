import type { Platform } from '../platform/types';
import type { ProjectSettingsPatch } from '../types';
import { initCustomStylesDrawer } from '../ui/settings/custom-styles-setup';
import { setupEditorSettingsDrawer } from '../ui/settings/editor-settings-setup';
import { initListsDrawer } from '../ui/settings/lists-setup';
import { initPageSetupDrawer } from '../ui/settings/page-setup';
import { initProjectMetadataDrawer } from '../ui/settings/project-metadata';
import { initSpecialHeadingsDrawer } from '../ui/settings/special-headings-setup';
import { initTablesDrawer } from '../ui/settings/tables-setup';
import { initImageSettingsDrawer } from '../ui/settings/image-settings-setup';
import { initTocSetupDrawer } from '../ui/settings/toc-setup';
import { initTypographyDrawer } from '../ui/settings/typography-setup';
import { initializeDrawerColorControls } from '../ui/components/drawerControls';
import { initSettingsDrawers } from '../ui/settings/settings-drawer';

/** Registers settings feature drawers with their shared project-settings writer. */
export function setupSettingsFeatures(
  platform: Platform,
  saveSettings: (patch: ProjectSettingsPatch) => Promise<void>,
  resetImageDefaults?: (imageSetup: import('../types').ImageSetup) => Promise<void>
): void {
  initPageSetupDrawer(async (pageSetup) => saveSettings({ pageSetup }));
  initTocSetupDrawer(async (pageSetup) => saveSettings({ pageSetup }));
  initSpecialHeadingsDrawer(async (pageSetup) => saveSettings({ pageSetup }));
  initTypographyDrawer(async (typographySetup) => saveSettings({ typographySetup }));
  initListsDrawer(async (listSetup) => saveSettings({ listSetup }));
  initTablesDrawer(async (tableSetup) => saveSettings({ tableSetup }));
  initImageSettingsDrawer(async (imageSetup) => {
    if (resetImageDefaults) await resetImageDefaults(imageSetup);
    else await saveSettings({ imageSetup });
  });
  initProjectMetadataDrawer(async (projectMetadata) => saveSettings({ projectMetadata }));
  initCustomStylesDrawer(platform, async (customStyles, customBlockStyles) => saveSettings({ customStyles, customBlockStyles }));
  setupEditorSettingsDrawer(async (editorSetup) => saveSettings({ editorSetup }));
  initializeDrawerColorControls();
  initSettingsDrawers();
}
