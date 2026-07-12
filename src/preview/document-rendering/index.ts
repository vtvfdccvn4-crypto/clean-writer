import type { FileNode } from '../../state';
import type { DocumentSectionInput } from './common';
import { buildDocumentPreviewInput, classifyDocumentMode } from './common';

export { classifyDocumentMode } from './common';
export { renderDocumentSection } from './common';
export type { DocumentMode, DocumentSectionInput, DocumentPreviewInput, DocumentPreviewSourceSegment } from './common';
export { buildSectionsFilesMarkdown } from './sectionsFiles';
export { buildSectionsFoldersMarkdown } from './sectionsFolders';
export { buildSectionsMixedMarkdown } from './sectionsMixed';

export function buildFullDocumentMarkdown(
  sections: Pick<FileNode, 'path' | 'isDir' | 'pageBreak' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>[],
  blocks: DocumentSectionInput[]
): string {
  return buildFullDocumentPreviewInput(sections, blocks).markdown;
}

export function buildFullDocumentPreviewInput(
  sections: Pick<FileNode, 'path' | 'isDir' | 'pageBreak' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>[],
  blocks: DocumentSectionInput[]
) {
  const mode = classifyDocumentMode(sections);
  return buildDocumentPreviewInput(sections, blocks, mode);
}
