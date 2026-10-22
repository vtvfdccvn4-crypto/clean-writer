/** The application state published by src/state.ts. */
import type { CustomBlockStyle, CustomStyle, ImageSetup, ListSetup, PageSetup, ProjectMetadata, TableSetup, TypographySetup } from './document-setup';
import type { EditorSetup } from './editor';
import type { FileNode, WorkspaceRef } from './project';

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
  imageSetup: ImageSetup;
  projectMetadata: ProjectMetadata;
  customStyles: CustomStyle[];
  customBlockStyles: CustomBlockStyle[];
  editorSetup: EditorSetup;
}
