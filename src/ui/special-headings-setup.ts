import { state } from '../state';
import type { PageSetup, SpecialHeadingDefinition } from '../types';
import { bindDrawerToggleButton, getDrawerToggleButtonState, readDrawerNumber, setDrawerToggleButtonState } from './components/drawerControls';
import { setFontFamilySelectValue } from '../config/font-families';
import { bindProjectSettingsPanel } from './project-settings-panel';

export function initSpecialHeadingsDrawer(onSave: (setup: PageSetup) => Promise<void>) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const sync = () => {
    const definition = state.current.pageSetup.specialHeadings?.find(item => item.id === 'exercise');
    if (!definition) return;
    get<HTMLInputElement>('special-heading-directive').value = definition.directive;
    get<HTMLSelectElement>('special-heading-level').value = String(definition.headingLevel);
    get<HTMLInputElement>('special-heading-start').value = String(definition.counterStart);
    get<HTMLInputElement>('special-heading-counter-prefix').value = definition.counterPrefix || `${definition.counterLabel || 'Exercise'} `;
    get<HTMLInputElement>('special-heading-counter-suffix').value = definition.counterSuffix || '';
    setDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-break'), definition.breakBefore);
    setDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-toc'), definition.includeInToc);
    setFontFamilySelectValue(get<HTMLSelectElement>('special-heading-font'), definition.fontFamily);
    get<HTMLInputElement>('special-heading-size').value = String(definition.fontSize);
    get<HTMLInputElement>('special-heading-color').value = definition.color || '#000000';
    setDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-bold'), definition.isBold);
    setDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-italic'), definition.isItalic);
    setDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-all-caps'), definition.isAllCaps);
    get<HTMLInputElement>('special-heading-line-height').value = String(definition.lineHeight);
    get<HTMLInputElement>('special-heading-margin-top').value = String(definition.marginTop);
    get<HTMLInputElement>('special-heading-margin-bottom').value = String(definition.marginBottom);
  };
  get<HTMLButtonElement>('btn-apply-special-heading').addEventListener('click', async () => {
    const existing = state.current.pageSetup.specialHeadings?.find(item => item.id === 'exercise')!;
    const definition: SpecialHeadingDefinition = {
      ...existing, id: 'exercise', name: 'Exercise',
      directive: get<HTMLInputElement>('special-heading-directive').value.trim() || ':::exercise',
      headingLevel: readDrawerNumber('special-heading-level', 3, { integer: true, min: 1, max: 6 }),
      counterStart: readDrawerNumber('special-heading-start', 1, { integer: true, min: 1, max: 9999 }),
      counterPrefix: get<HTMLInputElement>('special-heading-counter-prefix').value,
      counterSuffix: get<HTMLInputElement>('special-heading-counter-suffix').value,
      breakBefore: getDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-break')),
      includeInToc: getDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-toc')),
      fontFamily: get<HTMLSelectElement>('special-heading-font').value,
      fontSize: readDrawerNumber('special-heading-size', 11, { integer: true, min: 1, max: 200 }),
      color: get<HTMLInputElement>('special-heading-color').value,
      isBold: getDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-bold')),
      isItalic: getDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-italic')),
      isAllCaps: getDrawerToggleButtonState(get<HTMLButtonElement>('special-heading-all-caps')),
      lineHeight: readDrawerNumber('special-heading-line-height', 1.2, { min: .5, max: 3 }),
      marginTop: readDrawerNumber('special-heading-margin-top', 12, { min: 0, max: 500 }),
      marginBottom: readDrawerNumber('special-heading-margin-bottom', 6, { min: 0, max: 500 })
    };
    const setup = { ...state.current.pageSetup, specialHeadings: [definition, ...(state.current.pageSetup.specialHeadings || []).filter(item => item.id !== 'exercise')] };
    await onSave(setup);
  });
  ['special-heading-break', 'special-heading-toc', 'special-heading-bold', 'special-heading-italic', 'special-heading-all-caps']
    .forEach(id => bindDrawerToggleButton(get<HTMLButtonElement>(id)));
  bindProjectSettingsPanel(sync, { tabId: 'special-headings' });
}
