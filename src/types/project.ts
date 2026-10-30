/** Project files, workspace references, persisted settings and their mutations. */
import type { CustomBlockStyle, CustomStyle, ImageSetup, ListSetup, PageSetup, ProjectMetadata, TableSetup, TypographySetup } from './document-setup';
import type { EditorSetup } from './editor';

export interface FileNode {
  path: string;
  isDir: boolean;
  pageBreak?: boolean;
  hideHeader?: boolean;
  hideFooter?: boolean;
  numberHeadings?: boolean;
  includeInToc?: boolean;
}

export interface WorkspaceRef {
  id: string;
  kind: 'memory' | 'opfs' | 'directory' | 'file';
  displayName: string;
}

export type ProjectSettingsPatch = Partial<Omit<ProjectSettingsData, 'schemaVersion'>>;
export type ProjectPathSettingKey = 'pageBreaks' | 'hiddenHeaders' | 'hiddenFooters' | 'numberedHeadings' | 'tocSections';

export type ProjectSettingsMutation =
  | { type: 'patch'; values: ProjectSettingsPatch }
  | { type: 'set-order'; order: string[] }
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
  imageSetup: ImageSetup;
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
  imageSetup: ImageSetup;
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
