import { state } from '../state';
import type { TypographySetup } from '../state';
import { bindDrawerToggleButton, getDrawerToggleButtonState, readDrawerNumber, setDrawerToggleButtonState } from './components/drawerControls';
import { DEFAULT_BODY_FONT_FAMILY, DEFAULT_HEADING_FONT_FAMILY, setFontFamilySelectValue } from '../config/font-families';
import { bindProjectSettingsPanel } from './project-settings-panel';

let currentElementKey: keyof TypographySetup = 'paragraph';

let elementSelect: HTMLSelectElement;
let fontFamilySelect: HTMLSelectElement;
let fontSizeInput: HTMLSelectElement;
let fontColorInput: HTMLInputElement;
let fontBoldCheck: HTMLButtonElement;
let fontItalicCheck: HTMLButtonElement;
let lineHeightInput: HTMLInputElement;
let marginTopInput: HTMLInputElement;
let marginBottomInput: HTMLInputElement;

export function initTypographyDrawer(onSaveSetup: (setup: TypographySetup) => Promise<void>) {
  const btnApplyTypography = document.getElementById('btn-apply-typography')!;

  elementSelect = document.getElementById('typography-element-select') as HTMLSelectElement;
  fontFamilySelect = document.getElementById('typo-font-family') as HTMLSelectElement;
  fontSizeInput = document.getElementById('typo-font-size') as HTMLSelectElement;
  fontColorInput = document.getElementById('typo-font-color') as HTMLInputElement;
  fontBoldCheck = document.getElementById('typo-font-bold') as HTMLButtonElement;
  fontItalicCheck = document.getElementById('typo-font-italic') as HTMLButtonElement;
  lineHeightInput = document.getElementById('typo-line-height') as HTMLInputElement;
  marginTopInput = document.getElementById('typo-margin-top') as HTMLInputElement;
  marginBottomInput = document.getElementById('typo-margin-bottom') as HTMLInputElement;

  bindDrawerToggleButton(fontBoldCheck);
  bindDrawerToggleButton(fontItalicCheck);

  state.onTypographySetupChanged(syncInputs);
  bindProjectSettingsPanel(syncInputs, { tabId: 'typography' });

  elementSelect.addEventListener('change', () => {
    currentElementKey = elementSelect.value as keyof TypographySetup;
    syncInputs();
  });

  btnApplyTypography.addEventListener('click', async () => {
    // We update the current element in the state.
    // To avoid mutating the reference directly in a way that skips EventTarget detection,
    // we clone the setup, modify it, and set it.
    const setup = JSON.parse(JSON.stringify(state.current.typographySetup)) as TypographySetup;
    
    setup[currentElementKey] = {
      fontFamily: fontFamilySelect.value,
      fontSize: readDrawerNumber(fontSizeInput, 11, { integer: true, min: 1, max: 200 }),
      color: fontColorInput.value,
      isBold: getDrawerToggleButtonState(fontBoldCheck),
      isItalic: getDrawerToggleButtonState(fontItalicCheck),
      lineHeight: readDrawerNumber(lineHeightInput, 1.5, { min: 0.5, max: 5 }),
      marginTop: readDrawerNumber(marginTopInput, 0, { min: 0, max: 500 }),
      marginBottom: readDrawerNumber(marginBottomInput, 0, { min: 0, max: 500 })
    };

    await onSaveSetup(setup);
  });

  syncInputs();
}

function syncInputs() {
  const setup = state.current.typographySetup;
  const currentStyle = setup[currentElementKey];

  const fallbackFont = currentElementKey === 'paragraph' ? DEFAULT_BODY_FONT_FAMILY : DEFAULT_HEADING_FONT_FAMILY;
  setFontFamilySelectValue(fontFamilySelect, currentStyle.fontFamily, fallbackFont);
  fontSizeInput.value = String(currentStyle.fontSize ?? 11);
  fontColorInput.value = currentStyle.color;
  setDrawerToggleButtonState(fontBoldCheck, currentStyle.isBold);
  setDrawerToggleButtonState(fontItalicCheck, currentStyle.isItalic);
  lineHeightInput.value = String(currentStyle.lineHeight ?? 1.5);
  marginTopInput.value = String(currentStyle.marginTop ?? 0);
  marginBottomInput.value = String(currentStyle.marginBottom ?? 0);
}
