/** Editor display and behaviour preferences. */

export interface EditorSetup {
  lineWrapping: boolean;
  spellcheck: boolean;
  linkUnderline: boolean;
  fontSize: string;
  headingBold: boolean;
  strongBold: boolean;
  emphasisItalic: boolean;
  lineNumbers: boolean;
  foldGutter: boolean;
  foldGutterGlyph: 'chevrons' | 'triangles' | 'arrows' | 'plus-minus';
  highlightActiveLine: boolean;
  highlightSpecialCharacters: boolean;
  bracketMatching: boolean;
  closeBrackets: boolean;
  autocompletion: boolean;
  indentOnInput: boolean;
  multipleSelections: boolean;
  rectangularSelection: boolean;
  highlightSelectionMatches: boolean;
}
