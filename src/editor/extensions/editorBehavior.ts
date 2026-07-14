import { Compartment, EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { StateEffect } from '@codemirror/state';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { indentOnInput, bracketMatching, foldGutter } from '@codemirror/language';
import {
  crosshairCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view';
import { highlightSelectionMatches } from '@codemirror/search';

import type { EditorSetup } from '../../types';

const enabled = (value: boolean, extension: Extension): Extension => value ? extension : [];

function foldGutterExtension(setup: EditorSetup): Extension {
  const glyphs: Record<EditorSetup['foldGutterGlyph'], { openText: string; closedText: string }> = {
    chevrons: { openText: '⌄', closedText: '›' },
    triangles: { openText: '▾', closedText: '▸' },
    arrows: { openText: '↓', closedText: '→' },
    'plus-minus': { openText: '−', closedText: '+' }
  };
  return enabled(setup.foldGutter, foldGutter(glyphs[setup.foldGutterGlyph]));
}

/** Each saved editor setting owns one CodeMirror compartment. */
export function createEditorBehavior(setup: EditorSetup) {
  let currentSetup = setup;
  const lineWrapping = new Compartment();
  const lineNumbersGutter = new Compartment();
  const folding = new Compartment();
  const activeLine = new Compartment();
  const specialCharacters = new Compartment();
  const brackets = new Compartment();
  const closingBrackets = new Compartment();
  const completions = new Compartment();
  const indentation = new Compartment();
  const multipleSelections = new Compartment();
  const rectangularSelections = new Compartment();
  const selectionMatches = new Compartment();

  return {
    extensions: [
      lineWrapping.of(enabled(setup.lineWrapping, EditorView.lineWrapping)),
      lineNumbersGutter.of(enabled(setup.lineNumbers, lineNumbers())),
      folding.of(foldGutterExtension(setup)),
      activeLine.of(enabled(setup.highlightActiveLine, [highlightActiveLine(), highlightActiveLineGutter()])),
      specialCharacters.of(enabled(setup.highlightSpecialCharacters, highlightSpecialChars())),
      brackets.of(enabled(setup.bracketMatching, bracketMatching())),
      closingBrackets.of(enabled(setup.closeBrackets, [closeBrackets(), keymap.of(closeBracketsKeymap)])),
      completions.of(enabled(setup.autocompletion, [autocompletion(), keymap.of(completionKeymap)])),
      indentation.of(enabled(setup.indentOnInput, indentOnInput())),
      multipleSelections.of(EditorState.allowMultipleSelections.of(setup.multipleSelections)),
      rectangularSelections.of(enabled(setup.rectangularSelection, [rectangularSelection(), crosshairCursor()])),
      selectionMatches.of(enabled(setup.highlightSelectionMatches, highlightSelectionMatches()))
    ],
    reconfigure(view: EditorView, value: EditorSetup): void {
      const effects: StateEffect<unknown>[] = [];
      if (currentSetup.lineWrapping !== value.lineWrapping) effects.push(lineWrapping.reconfigure(enabled(value.lineWrapping, EditorView.lineWrapping)));
      if (currentSetup.lineNumbers !== value.lineNumbers) effects.push(lineNumbersGutter.reconfigure(enabled(value.lineNumbers, lineNumbers())));
      if (currentSetup.foldGutter !== value.foldGutter || currentSetup.foldGutterGlyph !== value.foldGutterGlyph) effects.push(folding.reconfigure(foldGutterExtension(value)));
      if (currentSetup.highlightActiveLine !== value.highlightActiveLine) effects.push(activeLine.reconfigure(enabled(value.highlightActiveLine, [highlightActiveLine(), highlightActiveLineGutter()])));
      if (currentSetup.highlightSpecialCharacters !== value.highlightSpecialCharacters) effects.push(specialCharacters.reconfigure(enabled(value.highlightSpecialCharacters, highlightSpecialChars())));
      if (currentSetup.bracketMatching !== value.bracketMatching) effects.push(brackets.reconfigure(enabled(value.bracketMatching, bracketMatching())));
      if (currentSetup.closeBrackets !== value.closeBrackets) effects.push(closingBrackets.reconfigure(enabled(value.closeBrackets, [closeBrackets(), keymap.of(closeBracketsKeymap)])));
      if (currentSetup.autocompletion !== value.autocompletion) effects.push(completions.reconfigure(enabled(value.autocompletion, [autocompletion(), keymap.of(completionKeymap)])));
      if (currentSetup.indentOnInput !== value.indentOnInput) effects.push(indentation.reconfigure(enabled(value.indentOnInput, indentOnInput())));
      if (currentSetup.multipleSelections !== value.multipleSelections) effects.push(multipleSelections.reconfigure(EditorState.allowMultipleSelections.of(value.multipleSelections)));
      if (currentSetup.rectangularSelection !== value.rectangularSelection) effects.push(rectangularSelections.reconfigure(enabled(value.rectangularSelection, [rectangularSelection(), crosshairCursor()])));
      if (currentSetup.highlightSelectionMatches !== value.highlightSelectionMatches) effects.push(selectionMatches.reconfigure(enabled(value.highlightSelectionMatches, highlightSelectionMatches())));
      currentSetup = value;
      if (effects.length) view.dispatch({ effects });
    }
  };
}
