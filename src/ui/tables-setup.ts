import { state } from '../state';
import type { TableSetup, TableStyle } from '../types';
import { setFontFamilySelectValue } from '../config/font-families';
import { readDrawerNumber } from './components/drawerControls';
import { bindProjectSettingsPanel } from './project-settings-panel';

export function initTablesDrawer(onSave: (setup: TableSetup) => Promise<void>) {
  const applyButton = document.getElementById('btn-apply-tables')!;
  const setColor = (id: string, value: string) => {
    const input = document.getElementById(id) as HTMLInputElement;
    input.value = value;
    const codeField = input.parentElement?.querySelector<HTMLInputElement>('.drawer-color-code');
    if (codeField) codeField.value = value.toUpperCase();
  };

  const readStyle = (prefix: string): TableStyle => ({
    fontFamily: (document.getElementById(`${prefix}-font`) as HTMLSelectElement).value,
    fontSize: readDrawerNumber(`${prefix}-font-size`, 10, { min: 1, max: 200 }),
    headerTextColor: (document.getElementById(`${prefix}-header-text-color`) as HTMLInputElement).value,
    headerBackground: (document.getElementById(`${prefix}-header-background`) as HTMLInputElement).value,
    headerBold: (document.getElementById(`${prefix}-header-bold`) as HTMLInputElement).checked,
    bodyTextColor: (document.getElementById(`${prefix}-body-text-color`) as HTMLInputElement).value,
    bodyBackground: (document.getElementById(`${prefix}-body-background`) as HTMLInputElement).value,
    alternateRowColor: (document.getElementById(`${prefix}-alternate-row-color`) as HTMLInputElement).value,
    borderColor: (document.getElementById(`${prefix}-border-color`) as HTMLInputElement).value,
    borderWidth: readDrawerNumber(`${prefix}-border-width`, 0.75, { min: 0, max: 10 }),
    cellPadding: readDrawerNumber(`${prefix}-cell-padding`, 6, { min: 0, max: 50 }),
    marginTop: readDrawerNumber(`${prefix}-margin-top`, 8, { min: 0, max: 200 }),
    marginBottom: readDrawerNumber(`${prefix}-margin-bottom`, 12, { min: 0, max: 200 })
  });

  function syncStyle(prefix: string, style: TableStyle) {
    setFontFamilySelectValue(document.getElementById(`${prefix}-font`) as HTMLSelectElement, style.fontFamily);
    (document.getElementById(`${prefix}-font-size`) as HTMLInputElement).value = String(style.fontSize);
    setColor(`${prefix}-header-text-color`, style.headerTextColor || '#FFFFFF');
    setColor(`${prefix}-header-background`, style.headerBackground || '#405A78');
    (document.getElementById(`${prefix}-header-bold`) as HTMLInputElement).checked = style.headerBold;
    setColor(`${prefix}-body-text-color`, style.bodyTextColor || '#000000');
    setColor(`${prefix}-body-background`, style.bodyBackground || '#FFFFFF');
    setColor(`${prefix}-alternate-row-color`, style.alternateRowColor || '#F2F2F2');
    setColor(`${prefix}-border-color`, style.borderColor || '#808080');
    (document.getElementById(`${prefix}-border-width`) as HTMLInputElement).value = String(style.borderWidth);
    (document.getElementById(`${prefix}-cell-padding`) as HTMLInputElement).value = String(style.cellPadding);
    (document.getElementById(`${prefix}-margin-top`) as HTMLInputElement).value = String(style.marginTop);
    (document.getElementById(`${prefix}-margin-bottom`) as HTMLInputElement).value = String(style.marginBottom);
  }

  function syncInputs() {
    syncStyle('table-1', state.current.tableSetup.table1);
    syncStyle('table-2', state.current.tableSetup.table2);
  }

  bindProjectSettingsPanel(syncInputs, { tabId: 'tables' });
  applyButton.addEventListener('click', async () => {
    const setup = { table1: readStyle('table-1'), table2: readStyle('table-2') };
    await onSave(setup);
  });
}
