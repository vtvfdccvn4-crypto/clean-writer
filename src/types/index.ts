export interface HeaderFooterCell {
  content: string;
  fontFamily: string;
  fontSize: number; // pt
  color: string;
  isBold: boolean;
  isItalic: boolean;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  horizontalAlign?: 'left' | 'center' | 'right';
}

export interface HeaderFooterRow {
  centerWidth: string; // e.g. "100px", "50%"
  left: HeaderFooterCell;
  center: HeaderFooterCell;
  right: HeaderFooterCell;
}

export interface TocStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  isBold: boolean;
  isItalic: boolean;
  isAllCaps: boolean;
}

export interface TocSetup {
  maxLevel: number;
  lineHeight?: number;
  h1: TocStyle;
  h2: TocStyle;
  h3: TocStyle;
  h4: TocStyle;
  h5: TocStyle;
  h6: TocStyle;
}

export interface SpecialHeadingDefinition {
  id: string;
  name: string;
  directive: string;
  headingLevel: number;
  /** @deprecated Migrated to counterPrefix when settings are next saved. */
  counterLabel?: string;
  counterStart: number;
  counterPrefix: string;
  counterSuffix: string;
  breakBefore: boolean;
  includeInToc: boolean;
  fontFamily: string;
  fontSize: number;
  color: string;
  isBold: boolean;
  isItalic: boolean;
  isAllCaps: boolean;
  lineHeight: number;
  marginTop: number;
  marginBottom: number;
}

export interface PageSetup {
  paperWidth: number;
  paperHeight: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  header: HeaderFooterRow;
  footer: HeaderFooterRow;
  toc?: TocSetup;
  specialHeadings?: SpecialHeadingDefinition[];
  showGuidelines?: boolean;
}

export interface TypographyStyle {
  fontFamily: string;
  fontSize: number; // pt
  color: string;
  isBold: boolean;
  isItalic: boolean;
  lineHeight: number;
  marginTop: number; // px or pt
  marginBottom: number; // px or pt
}

export interface TypographySetup {
  paragraph: TypographyStyle;
  h1: TypographyStyle;
  h2: TypographyStyle;
  h3: TypographyStyle;
  h4: TypographyStyle;
  h5: TypographyStyle;
  h6: TypographyStyle;
}

export interface ListStyle {
  fontFamily: string;
  fontSize: number; // pt
  color: string;
  isBold: boolean;
  isItalic: boolean;
  lineHeight: number;
  bulletIcon: string;
  bulletColor: string;
  marginLeft: number; // pt from the content edge to the marker
  paddingLeft: number; // pt between the marker and list-item text
}

export interface ListSetup {
  ulAsterisk: ListStyle;
  ulDash: ListStyle;
  ulPlus: ListStyle;
  ol: ListStyle; // Period delimiter: 1.
  olParen: ListStyle; // Parenthesis delimiter: 1)
}

export interface TableStyle {
  fontFamily: string;
  fontSize: number;
  headerTextColor: string;
  headerBackground: string;
  headerBold: boolean;
  bodyTextColor: string;
  bodyBackground: string;
  alternateRowColor: string;
  borderColor: string;
  borderWidth: number;
  cellPadding: number;
  marginTop: number;
  marginBottom: number;
}

export interface TableSetup {
  table1: TableStyle;
  table2: TableStyle;
}

export interface ProjectMetadata {
  author: string;
  documentTitle: string;
  documentName: string;
  documentNumber: string;
  documentRevision: string;
  documentType: string;
  productName: string;
  productModule: string;
  productVersion: string;
}

export interface CustomStyle {
  id: string;
  name: string;
  openingPair: string;
  closingPair: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  isBold: boolean;
  isItalic: boolean;
}

export interface CustomBlockStyle {
  id: string;
  name: string;
  prefix: string;
  icon: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  isBold: boolean;
  isItalic: boolean;
  lineHeight?: number;
  marginTop?: number;
  marginBottom?: number;
}

export interface FileNode {
  path: string;
  isDir: boolean;
  pageBreak?: boolean;
  hideHeader?: boolean;
  hideFooter?: boolean;
  numberHeadings?: boolean;
  includeInToc?: boolean;
}

export interface EditorSetup {
  lineWrapping: boolean;
  linkUnderline: boolean;
  fontSize: string;
  headingBold: boolean;
  headingColors: boolean;
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

export interface WorkspaceRef {
  id: string;
  kind: 'memory' | 'opfs' | 'directory';
  displayName: string;
}

export type ProjectSettingsPatch = Partial<Omit<ProjectSettingsData, 'schemaVersion'>>;
export type ProjectPathSettingKey = 'pageBreaks' | 'hiddenHeaders' | 'hiddenFooters' | 'numberedHeadings' | 'tocSections';

export type ProjectSettingsMutation =
  | { type: 'patch'; values: ProjectSettingsPatch }
  | { type: 'append-order'; path: string }
  | { type: 'replace-path'; oldPath: string; newPath: string }
  | { type: 'remove-path'; path: string }
  | { type: 'set-path-flag'; key: ProjectPathSettingKey; path: string; enabled?: boolean };

export type SectionPlacement = 'inside' | 'before' | 'after' | 'root';

export interface ProjectHealthIssue {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  recoverable: boolean;
}

export interface ProjectHealthReport {
  valid: boolean;
  recoverable: boolean;
  issues: ProjectHealthIssue[];
  backupPath?: string;
}

export interface ProjectSettingsData {
  schemaVersion: number;
  order: string[];
  pageBreaks: string[];
  hiddenHeaders: string[];
  hiddenFooters: string[];
  numberedHeadings: string[];
  tocSections: string[];
  pageSetup: PageSetup;
  typographySetup: TypographySetup;
  listSetup: ListSetup;
  tableSetup: TableSetup;
  projectMetadata: ProjectMetadata;
  customStyles: CustomStyle[];
  customBlockStyles: CustomBlockStyle[];
  editorSetup: EditorSetup;
}

export interface AppStateData {
  projectRevision: number;
  projectRef: WorkspaceRef | null;
  sections: FileNode[];
  images: FileNode[];
  activeFile: string | null;
  isFullDocMode: boolean;
  pageSetup: PageSetup;
  typographySetup: TypographySetup;
  listSetup: ListSetup;
  tableSetup: TableSetup;
  projectMetadata: ProjectMetadata;
  customStyles: CustomStyle[];
  customBlockStyles: CustomBlockStyle[];
  editorSetup: EditorSetup;
}

export interface ProjectSettingsSnapshot {
  pageSetup: PageSetup;
  typographySetup: TypographySetup;
  listSetup: ListSetup;
  tableSetup: TableSetup;
  projectMetadata: ProjectMetadata;
  customStyles: CustomStyle[];
  customBlockStyles: CustomBlockStyle[];
  editorSetup: EditorSetup;
}

export interface ProjectSnapshot extends ProjectSettingsSnapshot {
  projectRef: WorkspaceRef | null;
  sections: FileNode[];
  images: FileNode[];
}
