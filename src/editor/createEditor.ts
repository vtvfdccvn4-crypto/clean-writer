import { EditorView } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap, openSearchPanel } from '@codemirror/search';
import { tags } from '@lezer/highlight';

import { customTheme } from './theme';
import { pairingBindings, backspaceBinding } from './bindings/pairing';
import { tabBinding } from './bindings/tabBinding';
import { dragDropHandlers } from './dragDrop';
import { getCustomStylesExtension, updateCustomStyles } from './customStylesPlugin';
import { getCustomBlockStylesExtension, updateCustomBlockStyles } from './customBlockStylesPlugin';
import { state as appState } from '../state';
import type { EditorSetup, TypographySetup } from '../types';
import { ChangeCommitQueue } from './ChangeCommitQueue';

export interface EditorSelectionRange {
  from: number;
  to: number;
}

export interface MarkdownEditor {
  getValue(): string;
  setValue(value: string, notify?: boolean): void;
  getSelection(): EditorSelectionRange;
  setSelection(from: number, to?: number): void;
  insertText(text: string): void;
  focus(): void;
  /** Persist the most recent debounced document and wait for earlier saves. */
  flush(): Promise<void>;
  hasUnsavedChanges(): boolean;
  destroy(): void;
  updateCustomStyles(): void;
  openSearchPanel(): void;
  readonly view: EditorView;
}

export interface EditorCallbacks {
  onChange: (doc: string) => void | Promise<void>;
  onError?: (error: unknown) => void;
  onCursorActivity: (line: number, isTextMutation: boolean) => void;
  onDirty?: (doc: string) => void;
}

export function createEditor(
  parent: HTMLElement,
  initialContent: string,
  callbacks: EditorCallbacks
): MarkdownEditor {
  
  const reportBackgroundSaveError = (error: unknown) => {
    if (callbacks.onError) callbacks.onError(error);
    else console.error('[MarkdownEditor] Autosave failed:', error);
  };
  const changeQueue = new ChangeCommitQueue(callbacks.onChange, reportBackgroundSaveError);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.selectionSet || update.docChanged) {
      const state = update.state;
      const selection = state.selection.main;
      const line = state.doc.lineAt(selection.head).number;
      callbacks.onCursorActivity(line, update.docChanged);
    }

    if (update.docChanged) {
      const nextDoc = update.state.doc.toString();
      if (callbacks.onDirty) callbacks.onDirty(nextDoc);
      changeQueue.schedule(nextDoc);
    }
  });

  const compartments = {
    lineWrapping: new Compartment(),
    markdownAppearance: new Compartment(),
    lineNumbers: new Compartment(),
    foldGutter: new Compartment(),
    activeLine: new Compartment(),
    specialCharacters: new Compartment(),
    bracketMatching: new Compartment(),
    closeBrackets: new Compartment(),
    autocompletion: new Compartment(),
    indentOnInput: new Compartment(),
    multipleSelections: new Compartment(),
    rectangularSelection: new Compartment(),
    selectionMatches: new Compartment()
  };

  const optional = (enabled: boolean, extension: Extension): Extension =>
    enabled ? extension : [];

  const foldingControls = (setup: EditorSetup): Extension => {
    const glyphs: Record<EditorSetup['foldGutterGlyph'], { openText: string; closedText: string }> = {
      chevrons: { openText: '⌄', closedText: '›' },
      triangles: { openText: '▾', closedText: '▸' },
      arrows: { openText: '↓', closedText: '→' },
      'plus-minus': { openText: '−', closedText: '+' }
    };
    const glyph = glyphs[setup.foldGutterGlyph] ?? glyphs.chevrons;
    return foldGutter(glyph);
  };

  const markdownAppearance = (setup: EditorSetup, typography: TypographySetup) => {
    const headings = [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6];
    const headingStyles = headings.map((tag, index) => ({
      tag,
      ...(setup.headingBold ? { fontWeight: '700' } : { fontWeight: 'normal' }),
      ...(setup.headingColors ? { color: typography[`h${index + 1}` as keyof TypographySetup].color } : {})
    }));

    return syntaxHighlighting(HighlightStyle.define([
      ...headingStyles,
      { tag: tags.strong, fontWeight: setup.strongBold ? '700' : 'normal' },
      { tag: tags.emphasis, fontStyle: setup.emphasisItalic ? 'italic' : 'normal' },
      { tag: [tags.link, tags.url], textDecoration: setup.linkUnderline ? 'underline' : 'none' }
    ]));
  };

  const editorSetup = appState.get.editorSetup;

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      keymap.of([...pairingBindings, backspaceBinding, tabBinding]),
      history(),
      drawSelection(),
      dropCursor(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap
      ]),
      markdown(),
      customTheme,
      compartments.lineWrapping.of(optional(editorSetup.lineWrapping, EditorView.lineWrapping)),
      compartments.markdownAppearance.of(markdownAppearance(editorSetup, appState.get.typographySetup)),
      compartments.lineNumbers.of(optional(editorSetup.lineNumbers, lineNumbers())),
      compartments.foldGutter.of(optional(editorSetup.foldGutter, foldingControls(editorSetup))),
      compartments.activeLine.of(optional(editorSetup.highlightActiveLine, [highlightActiveLine(), highlightActiveLineGutter()])),
      compartments.specialCharacters.of(optional(editorSetup.highlightSpecialCharacters, highlightSpecialChars())),
      compartments.bracketMatching.of(optional(editorSetup.bracketMatching, bracketMatching())),
      compartments.closeBrackets.of(optional(editorSetup.closeBrackets, closeBrackets())),
      compartments.autocompletion.of(optional(editorSetup.autocompletion, autocompletion())),
      compartments.indentOnInput.of(optional(editorSetup.indentOnInput, indentOnInput())),
      compartments.multipleSelections.of(EditorState.allowMultipleSelections.of(editorSetup.multipleSelections)),
      compartments.rectangularSelection.of(optional(editorSetup.rectangularSelection, [rectangularSelection(), crosshairCursor()])),
      compartments.selectionMatches.of(optional(editorSetup.highlightSelectionMatches, highlightSelectionMatches())),
      updateListener,
      dragDropHandlers,
      getCustomStylesExtension(),
      getCustomBlockStylesExtension()
    ]
  });

  const view = new EditorView({
    state,
    parent
  });

  const onCustomStylesChanged = () => updateCustomStyles(view);
  const onCustomBlockStylesChanged = () => updateCustomBlockStyles(view);
  const onEditorSetupChanged = () => {
    const setup = appState.get.editorSetup;
    view.dispatch({
      effects: [
        compartments.lineWrapping.reconfigure(optional(setup.lineWrapping, EditorView.lineWrapping)),
        compartments.markdownAppearance.reconfigure(markdownAppearance(setup, appState.get.typographySetup)),
        compartments.lineNumbers.reconfigure(optional(setup.lineNumbers, lineNumbers())),
        compartments.foldGutter.reconfigure(optional(setup.foldGutter, foldingControls(setup))),
        compartments.activeLine.reconfigure(optional(setup.highlightActiveLine, [highlightActiveLine(), highlightActiveLineGutter()])),
        compartments.specialCharacters.reconfigure(optional(setup.highlightSpecialCharacters, highlightSpecialChars())),
        compartments.bracketMatching.reconfigure(optional(setup.bracketMatching, bracketMatching())),
        compartments.closeBrackets.reconfigure(optional(setup.closeBrackets, closeBrackets())),
        compartments.autocompletion.reconfigure(optional(setup.autocompletion, autocompletion())),
        compartments.indentOnInput.reconfigure(optional(setup.indentOnInput, indentOnInput())),
        compartments.multipleSelections.reconfigure(EditorState.allowMultipleSelections.of(setup.multipleSelections)),
        compartments.rectangularSelection.reconfigure(optional(setup.rectangularSelection, [rectangularSelection(), crosshairCursor()])),
        compartments.selectionMatches.reconfigure(optional(setup.highlightSelectionMatches, highlightSelectionMatches()))
      ]
    });
  };
  const onTypographySetupChanged = () => {
    view.dispatch({
      effects: compartments.markdownAppearance.reconfigure(
        markdownAppearance(appState.get.editorSetup, appState.get.typographySetup)
      )
    });
  };
  
  appState.addEventListener('custom-styles-changed', onCustomStylesChanged);
  appState.addEventListener('custom-block-styles-changed', onCustomBlockStylesChanged);
  appState.addEventListener('editor-setup-changed', onEditorSetupChanged);
  appState.addEventListener('typography-setup-changed', onTypographySetupChanged);

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (value: string, notify = true) => {
      if (value === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: 0 },
        scrollIntoView: true
      });
      if (notify) {
        changeQueue.schedule(value);
        void changeQueue.flush().catch(reportBackgroundSaveError);
      }
    },
    getSelection: () => {
      const selection = view.state.selection.main;
      return { from: selection.from, to: selection.to };
    },
    setSelection: (from: number, to = from) => {
      const documentLength = view.state.doc.length;
      view.dispatch({
        selection: {
          anchor: Math.min(Math.max(0, from), documentLength),
          head: Math.min(Math.max(0, to), documentLength)
        },
        scrollIntoView: true
      });
    },
    insertText: (text: string) => {
      const selection = view.state.selection.main;
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text
        },
        selection: {
          anchor: selection.from + text.length
        },
        scrollIntoView: true
      });
      view.focus();
    },
    focus: () => view.focus(),
    flush: () => changeQueue.flush(),
    hasUnsavedChanges: () => changeQueue.hasUnsavedChanges(),
    destroy: () => {
      changeQueue.cancel();
      appState.removeEventListener('custom-styles-changed', onCustomStylesChanged);
      appState.removeEventListener('custom-block-styles-changed', onCustomBlockStylesChanged);
      appState.removeEventListener('editor-setup-changed', onEditorSetupChanged);
      appState.removeEventListener('typography-setup-changed', onTypographySetupChanged);
      view.destroy();
    },
    updateCustomStyles: () => updateCustomStyles(view),
    openSearchPanel: () => openSearchPanel(view),
    get view() { return view; }
  };
}
