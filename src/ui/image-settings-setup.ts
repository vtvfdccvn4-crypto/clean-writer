import { state } from '../state';
import type { ImageSetup } from '../types';
import { readDrawerNumber } from './components/drawerControls';
import { bindProjectSettingsPanel } from './project-settings-panel';

export function initImageSettingsDrawer(onSave: (setup: ImageSetup) => Promise<void>): void {
  const alignment = document.getElementById('image-alignment') as HTMLSelectElement;
  const marginTop = document.getElementById('image-margin-top') as HTMLInputElement;
  const marginBottom = document.getElementById('image-margin-bottom') as HTMLInputElement;
  const applyButton = document.getElementById('btn-apply-image-settings') as HTMLButtonElement;

  const syncInputs = () => {
    const setup = state.current.imageSetup;
    alignment.value = setup.alignment;
    marginTop.value = String(setup.marginTop);
    marginBottom.value = String(setup.marginBottom);
  };

  bindProjectSettingsPanel(syncInputs, { tabId: 'images' });
  applyButton.addEventListener('click', async () => {
    await onSave({
      alignment: alignment.value as ImageSetup['alignment'],
      marginTop: readDrawerNumber(marginTop, 6, { min: 0, max: 200 }),
      marginBottom: readDrawerNumber(marginBottom, 6, { min: 0, max: 200 })
    });
  });
}
