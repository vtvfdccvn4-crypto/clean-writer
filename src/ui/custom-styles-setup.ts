import { state } from '../state';
import type { CustomStyle, CustomBlockStyle } from '../types';
import { bindDrawerToggleButton, getDrawerToggleButtonState, readDrawerNumber, setDrawerToggleButtonState } from './components/drawerControls';
import { setFontFamilySelectValue } from '../config/font-families';
import { createBlockIcon, initBlockGlyphPicker, loadBlockGlyphOptions, updateBlockGlyphPreview } from './block-glyph-picker';
import { showConfirmDialog } from './confirm-dialog';
import type { Platform } from '../platform/types';
import { onSettingsTabActivated } from './settings-drawer';
import { bindProjectSettingsPanel } from './project-settings-panel';

let activePlatform: Platform | null = null;
let onSaveCallback: ((styles: CustomStyle[], blockStyles: CustomBlockStyle[]) => Promise<void>) | null = null;

function getBlockSpacing(style?: CustomBlockStyle) {
  const paragraph = state.current.typographySetup.paragraph;
  return {
    lineHeight: style?.lineHeight ?? paragraph.lineHeight,
    marginTop: style?.marginTop ?? paragraph.marginTop,
    marginBottom: style?.marginBottom ?? paragraph.marginBottom
  };
}

function setBlockSpacingInputs(style?: CustomBlockStyle) {
  const spacing = getBlockSpacing(style);
  (document.getElementById('cbs-line-height') as HTMLInputElement).value = String(spacing.lineHeight);
  (document.getElementById('cbs-margin-top') as HTMLInputElement).value = String(spacing.marginTop);
  (document.getElementById('cbs-margin-bottom') as HTMLInputElement).value = String(spacing.marginBottom);
}

function renderStylesList() {
  const container = document.getElementById('custom-styles-list');
  if (!container) return;
  container.innerHTML = '';

  const styles = state.current.customStyles || [];
  if (styles.length === 0) {
    container.innerHTML = '<div class="empty-state">No inline styles added yet.</div>';
    return;
  }

  styles.forEach((style) => {
    const el = document.createElement('div');
    el.className = 'custom-style-item';

    const head = document.createElement('div');
    head.className = 'custom-style-item-head';

    const previewContainer = document.createElement('div');
    previewContainer.className = 'custom-style-preview';
    const name = document.createElement('strong');
    name.textContent = style.name || 'Unnamed Style';
    const preview = document.createElement('span');
    if (style.fontFamily) preview.style.fontFamily = style.fontFamily;
    if (style.fontSize) preview.style.fontSize = `${style.fontSize}pt`;
    if (style.color) preview.style.color = style.color;
    if (style.isBold) preview.style.fontWeight = 'bold';
    if (style.isItalic) preview.style.fontStyle = 'italic';
    preview.textContent = `${style.openingPair}text${style.closingPair}`;
    previewContainer.append(name, preview);

    const actions = createStyleActions();
    head.append(previewContainer, actions);
    el.append(head);

    el.querySelector('.edit-btn')?.addEventListener('click', () => editStyle(style));
    el.querySelector('.delete-btn')?.addEventListener('click', () => deleteStyle(style.id));
    
    container.appendChild(el);
  });
}

function renderBlockStylesList() {
  const container = document.getElementById('custom-block-styles-list');
  if (!container) return;
  container.innerHTML = '';

  const blockStyles = state.current.customBlockStyles || [];
  if (blockStyles.length === 0) {
    container.innerHTML = '<div class="empty-state">No quote styles added yet.</div>';
    return;
  }

  blockStyles.forEach((style) => {
    const el = document.createElement('div');
    el.className = 'custom-style-item';

    const spacing = getBlockSpacing(style);

    const head = document.createElement('div');
    head.className = 'custom-style-item-head';

    const preview = document.createElement('div');
    if (style.fontFamily) preview.style.fontFamily = style.fontFamily;
    if (style.fontSize) preview.style.fontSize = `${style.fontSize}pt`;
    if (style.color) preview.style.color = style.color;
    if (style.isBold) preview.style.fontWeight = 'bold';
    if (style.isItalic) preview.style.fontStyle = 'italic';
    preview.style.lineHeight = String(spacing.lineHeight);
    preview.style.marginTop = `${spacing.marginTop}pt`;
    preview.style.marginBottom = `${spacing.marginBottom}pt`;
    const icon = createBlockIcon(activePlatform?.assetResolver, style.icon, 'custom-block-style-list-icon');
    if (icon) preview.appendChild(icon);
    preview.append('Sample paragraph block');

    const previewContainer = document.createElement('div');
    previewContainer.className = 'custom-style-preview';
    const name = document.createElement('strong');
    name.textContent = `${style.name || 'Unnamed Quote'} (${style.prefix})`;
    previewContainer.append(name, preview);
    const actions = createStyleActions();
    head.append(previewContainer, actions);
    el.append(head);

    el.querySelector('.edit-btn')?.addEventListener('click', () => openBlockEditor(style));
    el.querySelector('.delete-btn')?.addEventListener('click', () => deleteBlockStyle(style.id));
    
    container.appendChild(el);
  });
}

function createStyleActions(): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'custom-style-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn edit-btn';
  edit.title = 'Edit';
  edit.textContent = '✎';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn delete-btn';
  remove.title = 'Delete';
  remove.textContent = '🗑';
  actions.append(edit, remove);
  return actions;
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function resetForm() {
  const form = document.getElementById('custom-style-form') as HTMLFormElement;
  if (form) {
    form.reset();
    (document.getElementById('cs-id') as HTMLInputElement).value = '';
  }
}

function resetBlockForm() {
  const form = document.getElementById('custom-block-style-form') as HTMLFormElement;
  if (form) {
    form.reset();
    (document.getElementById('cbs-id') as HTMLInputElement).value = '';
    updateBlockGlyphPreview(activePlatform?.assetResolver);
    setBlockSpacingInputs();
  }
}

function openBlockEditor(style?: CustomBlockStyle) {
  closeInlineEditor();
  const editor = document.getElementById('cbs-editor-card');
  const addButton = document.getElementById('cbs-add-btn') as HTMLButtonElement | null;
  if (!editor) return;
  resetBlockForm();
  if (style) {
    (document.getElementById('cbs-id') as HTMLInputElement).value = style.id;
    (document.getElementById('cbs-name') as HTMLInputElement).value = style.name || '';
    (document.getElementById('cbs-prefix') as HTMLInputElement).value = style.prefix;
    void loadBlockGlyphOptions(activePlatform!, style.icon);
    setFontFamilySelectValue(document.getElementById('cbs-font') as HTMLSelectElement, style.fontFamily);
    (document.getElementById('cbs-size') as HTMLSelectElement).value = style.fontSize ? style.fontSize.toString() : '';
    (document.getElementById('cbs-color') as HTMLInputElement).value = style.color || '#000000';
    setDrawerToggleButtonState('cbs-bold', style.isBold);
    setDrawerToggleButtonState('cbs-italic', style.isItalic);
    setBlockSpacingInputs(style);
  }
  editor.classList.remove('hidden');
  addButton?.setAttribute('aria-expanded', 'true');
  document.getElementById('cbs-submit-btn')!.textContent = 'Apply';
}

function closeBlockEditor() {
  const editor = document.getElementById('cbs-editor-card');
  const addButton = document.getElementById('cbs-add-btn') as HTMLButtonElement | null;
  if (editor) editor.classList.add('hidden');
  addButton?.setAttribute('aria-expanded', 'false');
  resetBlockForm();
}

function openInlineEditor(style?: CustomStyle) {
  closeBlockEditor();
  const editor = document.getElementById('cs-editor-card');
  const addButton = document.getElementById('cs-add-btn') as HTMLButtonElement | null;
  if (!editor) return;
  resetForm();
  if (style) {
    (document.getElementById('cs-id') as HTMLInputElement).value = style.id;
    (document.getElementById('cs-name') as HTMLInputElement).value = style.name || '';
    (document.getElementById('cs-opening') as HTMLInputElement).value = style.openingPair;
    (document.getElementById('cs-closing') as HTMLInputElement).value = style.closingPair;
    setFontFamilySelectValue(document.getElementById('cs-font') as HTMLSelectElement, style.fontFamily);
    (document.getElementById('cs-size') as HTMLSelectElement).value = style.fontSize ? style.fontSize.toString() : '';
    (document.getElementById('cs-color') as HTMLInputElement).value = style.color || '#000000';
    setDrawerToggleButtonState('cs-bold', style.isBold);
    setDrawerToggleButtonState('cs-italic', style.isItalic);
  }
  editor.classList.remove('hidden');
  addButton?.setAttribute('aria-expanded', 'true');
  document.getElementById('cs-submit-btn')!.textContent = 'Apply';
}

function closeInlineEditor() {
  const editor = document.getElementById('cs-editor-card');
  const addButton = document.getElementById('cs-add-btn') as HTMLButtonElement | null;
  if (editor) editor.classList.add('hidden');
  addButton?.setAttribute('aria-expanded', 'false');
  resetForm();
}

function editStyle(style: CustomStyle) {
  openInlineEditor(style);
}

async function deleteStyle(id: string) {
  const proceed = await showConfirmDialog({
    title: 'Delete Style',
    message: 'Are you sure you want to delete this style?',
    confirmLabel: 'Delete',
    tone: 'danger'
  });
  if (!proceed) return;
  const newStyles = (state.current.customStyles || []).filter(s => s.id !== id);
  if (onSaveCallback) await onSaveCallback(newStyles, state.current.customBlockStyles || []);
}

async function deleteBlockStyle(id: string) {
  const proceed = await showConfirmDialog({
    title: 'Delete Quote Style',
    message: 'Are you sure you want to delete this quote style?',
    confirmLabel: 'Delete',
    tone: 'danger'
  });
  if (!proceed) return;
  const newStyles = (state.current.customBlockStyles || []).filter(s => s.id !== id);
  if (onSaveCallback) await onSaveCallback(state.current.customStyles || [], newStyles);
}

export function initCustomStylesDrawer(platform: Platform, onSave: (styles: CustomStyle[], blockStyles: CustomBlockStyle[]) => Promise<void>) {
  activePlatform = platform;
  onSaveCallback = onSave;
  
  const btnAddInlineStyle = document.getElementById('cs-add-btn');
  const btnAddBlockStyle = document.getElementById('cbs-add-btn');
  
  const csForm = document.getElementById('custom-style-form') as HTMLFormElement;
  const cbsForm = document.getElementById('custom-block-style-form') as HTMLFormElement;

  initBlockGlyphPicker(activePlatform!);

  ['cs-bold', 'cs-italic', 'cbs-bold', 'cbs-italic'].forEach(id => bindDrawerToggleButton(id));

  onSettingsTabActivated('inline-styles', () => {
    closeBlockEditor();
  });

  onSettingsTabActivated('quote-styles', () => {
    closeInlineEditor();
    void loadBlockGlyphOptions(activePlatform!);
  });

  btnAddInlineStyle?.addEventListener('click', () => {
    openInlineEditor();
  });

  btnAddBlockStyle?.addEventListener('click', () => {
    openBlockEditor();
  });

  document.getElementById('cs-cancel-btn')?.addEventListener('click', closeInlineEditor);
  document.getElementById('cbs-cancel-btn')?.addEventListener('click', closeBlockEditor);

  if (csForm) {
    csForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idInput = (document.getElementById('cs-id') as HTMLInputElement).value;
      
      const newStyle: CustomStyle = {
        id: idInput || generateId(),
        name: (document.getElementById('cs-name') as HTMLInputElement).value || 'Unnamed Style',
        openingPair: (document.getElementById('cs-opening') as HTMLInputElement).value,
        closingPair: (document.getElementById('cs-closing') as HTMLInputElement).value,
        fontFamily: (document.getElementById('cs-font') as HTMLSelectElement).value,
        fontSize: readDrawerNumber('cs-size', 0, { integer: true, min: 0, max: 200 }),
        color: (document.getElementById('cs-color') as HTMLInputElement).value,
        isBold: getDrawerToggleButtonState('cs-bold'),
        isItalic: getDrawerToggleButtonState('cs-italic')
      };

      const currentStyles = [...(state.current.customStyles || [])];
      if (idInput) {
        const index = currentStyles.findIndex(s => s.id === idInput);
        if (index !== -1) currentStyles[index] = newStyle;
      } else {
        currentStyles.push(newStyle);
      }

      if (onSaveCallback) await onSaveCallback(currentStyles, state.current.customBlockStyles || []);
      closeInlineEditor();
    });
  }

  if (cbsForm) {
    cbsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idInput = (document.getElementById('cbs-id') as HTMLInputElement).value;
      
      const newStyle: CustomBlockStyle = {
        id: idInput || generateId(),
        name: (document.getElementById('cbs-name') as HTMLInputElement).value || 'Unnamed Quote',
        prefix: (document.getElementById('cbs-prefix') as HTMLInputElement).value,
        icon: (document.getElementById('cbs-icon') as HTMLInputElement).value,
        fontFamily: (document.getElementById('cbs-font') as HTMLSelectElement).value,
        fontSize: readDrawerNumber('cbs-size', 0, { integer: true, min: 0, max: 200 }),
        color: (document.getElementById('cbs-color') as HTMLInputElement).value,
        isBold: getDrawerToggleButtonState('cbs-bold'),
        isItalic: getDrawerToggleButtonState('cbs-italic'),
        lineHeight: readDrawerNumber('cbs-line-height', state.current.typographySetup.paragraph.lineHeight, { min: 0.5, max: 5 }),
        marginTop: readDrawerNumber('cbs-margin-top', 0, { min: 0, max: 500 }),
        marginBottom: readDrawerNumber('cbs-margin-bottom', 0, { min: 0, max: 500 })
      };

      const currentBlockStyles = [...(state.current.customBlockStyles || [])];
      if (idInput) {
        const index = currentBlockStyles.findIndex(s => s.id === idInput);
        if (index !== -1) currentBlockStyles[index] = newStyle;
      } else {
        currentBlockStyles.push(newStyle);
      }

      if (onSaveCallback) await onSaveCallback(state.current.customStyles || [], currentBlockStyles);
      closeBlockEditor();
    });
  }

  state.onCustomStylesChanged(renderStylesList);
  state.onCustomBlockStylesChanged(renderBlockStylesList);
  bindProjectSettingsPanel(() => {
    renderStylesList();
    renderBlockStylesList();
  });

  void loadBlockGlyphOptions(platform);
  setBlockSpacingInputs();
}
