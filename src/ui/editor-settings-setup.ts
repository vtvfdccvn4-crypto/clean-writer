import { state } from '../state';
import type { EditorSetup } from '../types';
import { bindProjectSettingsPanel } from './project-settings-panel';

function normalizeEditorFontSize(value: string | null | undefined, fallback: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return fallback;
  return /^\d+(?:\.\d+)?$/.test(trimmed) ? `${trimmed}pt` : trimmed;
}

function getEditorFontSizeSelectValue(value: string | null | undefined, fallback: string): string {
  return normalizeEditorFontSize(value, fallback).replace(/pt$/i, '');
}

export function setupEditorSettingsDrawer(onSave: (setup: EditorSetup) => Promise<void>): void {
  const fontSizeSelect = document.getElementById('drawer-editor-font-size') as HTMLSelectElement | null;
  const foldGlyphSelect = document.getElementById('editor-fold-gutter-glyph') as HTMLSelectElement | null;
  const switches: Array<[string, keyof EditorSetup]> = [
    ['editor-line-wrapping', 'lineWrapping'],
    ['editor-link-underline', 'linkUnderline'],
    ['editor-heading-bold', 'headingBold'],
    ['editor-strong-bold', 'strongBold'],
    ['editor-emphasis-italic', 'emphasisItalic'],
    ['editor-line-numbers', 'lineNumbers'],
    ['editor-fold-gutter', 'foldGutter'],
    ['editor-active-line', 'highlightActiveLine'],
    ['editor-special-characters', 'highlightSpecialCharacters'],
    ['editor-bracket-matching', 'bracketMatching'],
    ['editor-close-brackets', 'closeBrackets'],
    ['editor-autocompletion', 'autocompletion'],
    ['editor-indent-on-input', 'indentOnInput'],
    ['editor-multiple-selections', 'multipleSelections'],
    ['editor-rectangular-selection', 'rectangularSelection'],
    ['editor-selection-matches', 'highlightSelectionMatches']
  ];
  const save = (setup: EditorSetup) => {
    if (!state.current.projectRef) return;
    void onSave(setup).catch(() => undefined);
  };

  for (const [id, setting] of switches) {
    const checkbox = document.getElementById(id) as HTMLInputElement | null;
    if (!checkbox) continue;
    checkbox.checked = Boolean(state.current.editorSetup[setting]);
    checkbox.addEventListener('change', () => {
      save({
        ...state.current.editorSetup,
        [setting]: checkbox.checked
      });
    });
  }

  if (fontSizeSelect) {
    fontSizeSelect.value = getEditorFontSizeSelectValue(state.current.editorSetup.fontSize, '10pt');
    fontSizeSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      save({
        ...state.current.editorSetup,
        fontSize: normalizeEditorFontSize(target.value, state.current.editorSetup.fontSize)
      });
    });
  }

  if (foldGlyphSelect) {
    foldGlyphSelect.value = state.current.editorSetup.foldGutterGlyph;
    foldGlyphSelect.disabled = !state.current.editorSetup.foldGutter;
    foldGlyphSelect.addEventListener('change', () => {
      save({
        ...state.current.editorSetup,
        foldGutterGlyph: foldGlyphSelect.value as EditorSetup['foldGutterGlyph']
      });
    });
  }

  const syncControls = () => {
    const setup = state.current.editorSetup;
    for (const [id, setting] of switches) {
      const checkbox = document.getElementById(id) as HTMLInputElement | null;
      if (checkbox && checkbox.checked !== Boolean(setup[setting])) {
        checkbox.checked = Boolean(setup[setting]);
      }
    }
    const fontSizeValue = getEditorFontSizeSelectValue(setup.fontSize, '10pt');
    if (fontSizeSelect && fontSizeSelect.value !== fontSizeValue) {
      fontSizeSelect.value = fontSizeValue;
    }
    if (foldGlyphSelect) {
      if (foldGlyphSelect.value !== setup.foldGutterGlyph) {
        foldGlyphSelect.value = setup.foldGutterGlyph;
      }
      foldGlyphSelect.disabled = !setup.foldGutter;
    }
  };

  state.onEditorSetupChanged(syncControls);
  bindProjectSettingsPanel(syncControls, { tabId: 'editor' });

}
