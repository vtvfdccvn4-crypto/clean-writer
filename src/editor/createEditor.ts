import { EditorView } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, openSearchPanel } from '@codemirror/search';

import { DocumentSaveCoordinator } from './DocumentSaveCoordinator';
import { createEditorBehavior } from './extensions/editorBehavior';
import { customStyleHighlightingExtension } from './extensions/customStyleHighlighting';
import { editorSpacingExtension } from './extensions/editorSpacing';
import { imagePreviewExtension, type EditorImageAlignment, type EditorImageSourceResolver } from './extensions/imagePreviews';
import { imagePasteExtension } from './extensions/imagePasteExtension';
import type { PastedImageResult } from './extensions/imagePasteExtension';
import { markdownAppearanceExtension } from './extensions/markdownAppearance';
import { markdownLanguageExtension } from './extensions/markdown';
import { state as appState } from '../state';
import type { EditorSetup } from '../types';
import { imageWidthAttribute, parseEditorMarkdownImages, withImageWidthAttribute } from './markdown/parseMarkdownImage';
import { showImageWidthDialog } from '../ui/image-width-dialog';

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
  openSearchPanel(): void;
  readonly view: EditorView;
}

export interface EditorCallbacks {
  onChange: (doc: string) => void | Promise<void>;
  onError?: (error: unknown) => void;
  onSelectionChange?: (line: number) => void;
  onDirty?: (doc: string) => void;
  resolveImageSource?: EditorImageSourceResolver;
  onImageFile?: (file: File) => Promise<PastedImageResult | null>;
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
  const changeQueue = new DocumentSaveCoordinator(callbacks.onChange, reportBackgroundSaveError);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.selectionSet && !update.docChanged) {
      callbacks.onSelectionChange?.(update.state.doc.lineAt(update.state.selection.main.head).number);
    }

    if (update.docChanged) {
      const nextDoc = update.state.doc.toString();
      if (callbacks.onDirty) callbacks.onDirty(nextDoc);
      changeQueue.schedule(nextDoc);
    }
  });

  const markdownAppearance = new Compartment();
  const customStyleHighlighting = new Compartment();
  const imagePreviews = new Compartment();
  const editorSetup = appState.current.editorSetup;
  let markdownSetup = editorSetup;
  const behavior = createEditorBehavior(editorSetup);
  const editImageWidth = (image: ReturnType<typeof parseEditorMarkdownImages>[number]) => {
    void showImageWidthDialog(imageWidthAttribute(image.attributes)).then(width => {
      if (width === null) return;
      const currentImage = parseEditorMarkdownImages(view.state.doc.toString()).find(candidate =>
        candidate.source === image.source
        && candidate.alt === image.alt
        && candidate.attributes === image.attributes
      );
      if (!currentImage) return;
      const current = view.state.doc.sliceString(currentImage.start, currentImage.end);
      const replacement = `${current.slice(0, current.length - currentImage.attributes.length)}${withImageWidthAttribute(currentImage.attributes, width)}`;
      view.dispatch({
        changes: { from: currentImage.start, to: currentImage.end, insert: replacement },
        selection: { anchor: currentImage.start + replacement.length },
        scrollIntoView: true
      });
      view.focus();
    });
  };

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      history(),
      keymap.of([
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap
      ]),
      markdownLanguageExtension(),
      editorSpacingExtension(),
      markdownAppearance.of(markdownAppearanceExtension(editorSetup, appState.current.typographySetup)),
      customStyleHighlighting.of(customStyleHighlightingExtension(
        appState.current.customStyles,
        appState.current.customBlockStyles,
        appState.current.pageSetup.specialHeadings || [],
        editorSetup
      )),
      ...behavior.extensions,
      imagePreviews.of(callbacks.resolveImageSource
        ? imagePreviewExtension(callbacks.resolveImageSource, appState.current.imageSetup.alignment, editImageWidth)
        : []),
      ...(callbacks.onImageFile ? [imagePasteExtension(callbacks.onImageFile)] : []),
      updateListener
    ]
  });

  const view = new EditorView({
    state,
    parent
  });

  const onEditorSetupChanged = () => {
    const setup: EditorSetup = appState.current.editorSetup;
    behavior.reconfigure(view, setup);
    if (markdownSetup.headingBold !== setup.headingBold
      || markdownSetup.strongBold !== setup.strongBold
      || markdownSetup.emphasisItalic !== setup.emphasisItalic
      || markdownSetup.linkUnderline !== setup.linkUnderline) {
      view.dispatch({
        effects: [
          markdownAppearance.reconfigure(markdownAppearanceExtension(setup, appState.current.typographySetup)),
          customStyleHighlighting.reconfigure(customStyleHighlightingExtension(
            appState.current.customStyles,
            appState.current.customBlockStyles,
            appState.current.pageSetup.specialHeadings || [],
            setup
          ))
        ]
      });
    }
    markdownSetup = setup;
  };
  appState.addEventListener('editor-setup-changed', onEditorSetupChanged);
  const onTypographySetupChanged = () => {
    view.dispatch({
      effects: markdownAppearance.reconfigure(markdownAppearanceExtension(appState.current.editorSetup, appState.current.typographySetup))
    });
  };
  const onCustomStylesChanged = () => {
    view.dispatch({
      effects: customStyleHighlighting.reconfigure(customStyleHighlightingExtension(
        appState.current.customStyles,
        appState.current.customBlockStyles,
        appState.current.pageSetup.specialHeadings || [],
        appState.current.editorSetup
      ))
    });
  };
  appState.addEventListener('typography-setup-changed', onTypographySetupChanged);
  appState.addEventListener('page-setup-changed', onCustomStylesChanged);
  appState.addEventListener('custom-styles-changed', onCustomStylesChanged);
  appState.addEventListener('custom-block-styles-changed', onCustomStylesChanged);
  const onImageSetupChanged = () => {
    if (!callbacks.resolveImageSource) return;
    view.dispatch({
      effects: imagePreviews.reconfigure(imagePreviewExtension(
        callbacks.resolveImageSource,
        appState.current.imageSetup.alignment as EditorImageAlignment,
        editImageWidth
      ))
    });
  };
  appState.addEventListener('image-setup-changed', onImageSetupChanged);

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
      appState.removeEventListener('editor-setup-changed', onEditorSetupChanged);
      appState.removeEventListener('typography-setup-changed', onTypographySetupChanged);
      appState.removeEventListener('page-setup-changed', onCustomStylesChanged);
      appState.removeEventListener('custom-styles-changed', onCustomStylesChanged);
      appState.removeEventListener('custom-block-styles-changed', onCustomStylesChanged);
      appState.removeEventListener('image-setup-changed', onImageSetupChanged);
      view.destroy();
    },
    openSearchPanel: () => openSearchPanel(view),
    get view() { return view; }
  };
}
