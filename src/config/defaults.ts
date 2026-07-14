import type {
  PageSetup,
  TypographySetup,
  ListSetup,
  TableSetup,
  ImageSetup,
  ProjectMetadata,
  AppStateData,
  EditorSetup
} from '../types';
import {
  DEFAULT_BODY_FONT_FAMILY,
} from './font-families';

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paperWidth: 210,
  paperHeight: 297,
  marginTop: 25,
  marginBottom: 25,
  marginLeft: 20,
  marginRight: 20,
  showGuidelines: false,
  header: {
    centerWidth: '100px',
    left: { content: '', fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false },
    center: { content: '', fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false },
    right: { content: '', fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false },
  },
  footer: {
    centerWidth: '100px',
    left: { content: '', fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false },
    center: { content: '', fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false },
    right: { content: '', fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false },
  },
  toc: {
    maxLevel: 6,
    lineHeight: 1.2,
    h1: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 14, color: '#000000', isBold: false, isItalic: false, isAllCaps: false },
    h2: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 13, color: '#000000', isBold: false, isItalic: false, isAllCaps: false },
    h3: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 12, color: '#000000', isBold: false, isItalic: false, isAllCaps: false },
    h4: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, isAllCaps: false },
    h5: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, isAllCaps: false },
    h6: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, isAllCaps: false },
  },
  specialHeadings: [{
    id: 'exercise', name: 'Exercise', directive: ':::exercise', headingLevel: 3,
    counterPrefix: 'Exercise ', counterStart: 1, counterSuffix: '', breakBefore: true, includeInToc: true,
    fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 12, color: '#000000',
    isBold: true, isItalic: false, isAllCaps: false, lineHeight: 1.2, marginTop: 12, marginBottom: 6
  }]
};

export const DEFAULT_TYPOGRAPHY_SETUP: TypographySetup = {
  paragraph: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, lineHeight: 1.5, marginTop: 0, marginBottom: 8 },
  h1: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 24, color: '#000000', isBold: true, isItalic: false, lineHeight: 1.2, marginTop: 16, marginBottom: 8 },
  h2: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 20, color: '#000000', isBold: true, isItalic: false, lineHeight: 1.2, marginTop: 14, marginBottom: 7 },
  h3: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 18, color: '#000000', isBold: true, isItalic: false, lineHeight: 1.2, marginTop: 12, marginBottom: 6 },
  h4: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 16, color: '#000000', isBold: true, isItalic: false, lineHeight: 1.2, marginTop: 10, marginBottom: 5 },
  h5: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 14, color: '#000000', isBold: true, isItalic: false, lineHeight: 1.2, marginTop: 8, marginBottom: 4 },
  h6: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 12, color: '#000000', isBold: true, isItalic: false, lineHeight: 1.2, marginTop: 6, marginBottom: 3 }
};

export const DEFAULT_LIST_SETUP: ListSetup = {
  ulAsterisk: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, lineHeight: 1.4, bulletIcon: '*', bulletColor: '#000000', marginLeft: 20, paddingLeft: 8 },
  ulDash: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, lineHeight: 1.4, bulletIcon: '-', bulletColor: '#000000', marginLeft: 20, paddingLeft: 8 },
  ulPlus: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, lineHeight: 1.4, bulletIcon: '+', bulletColor: '#000000', marginLeft: 20, paddingLeft: 8 },
  ol: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, lineHeight: 1.4, bulletIcon: '1.', bulletColor: '#000000', marginLeft: 20, paddingLeft: 8 },
  olParen: { fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 11, color: '#000000', isBold: false, isItalic: false, lineHeight: 1.4, bulletIcon: '1)', bulletColor: '#000000', marginLeft: 20, paddingLeft: 8 }
};

export const DEFAULT_TABLE_SETUP: TableSetup = {
  table1: {
    fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 10, headerTextColor: '#ffffff', headerBackground: '#405a78', headerBold: true, bodyTextColor: '#000000', bodyBackground: '#ffffff', alternateRowColor: '#f2f2f2', borderColor: '#808080', borderWidth: 1, cellPadding: 6, marginTop: 8, marginBottom: 12,
  },
  table2: {
    fontFamily: DEFAULT_BODY_FONT_FAMILY, fontSize: 10, headerTextColor: '#000000', headerBackground: '#e8ece8', headerBold: true, bodyTextColor: '#000000', bodyBackground: '#ffffff', alternateRowColor: '#f2f2f2', borderColor: '#808080', borderWidth: 1, cellPadding: 6, marginTop: 8, marginBottom: 12,
  }
};

export const DEFAULT_IMAGE_SETUP: ImageSetup = {
  alignment: 'center',
  marginTop: 6,
  marginBottom: 6
};

export const DEFAULT_PROJECT_METADATA: ProjectMetadata = {
  author: '',
  documentTitle: '',
  documentName: '',
  documentNumber: '',
  documentRevision: '',
  documentType: '',
  productName: '',
  productModule: '',
  productVersion: ''
};

export const DEFAULT_EDITOR_SETUP: EditorSetup = {
  lineWrapping: true,
  linkUnderline: true,
  fontSize: '10pt',
  headingBold: true,
  strongBold: true,
  emphasisItalic: true,
  lineNumbers: true,
  foldGutter: true,
  foldGutterGlyph: 'chevrons',
  highlightActiveLine: true,
  highlightSpecialCharacters: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  indentOnInput: true,
  multipleSelections: true,
  rectangularSelection: true,
  highlightSelectionMatches: true
};

export const DEFAULT_APP_STATE: AppStateData = {
  projectRevision: 0,
  projectRef: null,
  sections: [],
  images: [],
  activeFile: null,
  isFullDocMode: true,
  pageSetup: DEFAULT_PAGE_SETUP,
  typographySetup: DEFAULT_TYPOGRAPHY_SETUP,
  listSetup: DEFAULT_LIST_SETUP,
  tableSetup: DEFAULT_TABLE_SETUP,
  imageSetup: DEFAULT_IMAGE_SETUP,
  projectMetadata: DEFAULT_PROJECT_METADATA,
  customStyles: [],
  customBlockStyles: [],
  editorSetup: DEFAULT_EDITOR_SETUP
};
