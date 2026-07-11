import type { FileNode } from '../../state';
import type { DocumentSectionInput } from './common';
import { classifyDocumentMode } from './common';
import { buildSectionsFilesMarkdown } from './sectionsFiles';
import { buildSectionsFoldersMarkdown } from './sectionsFolders';
import { buildSectionsMixedMarkdown } from './sectionsMixed';

export { classifyDocumentMode } from './common';
export { renderDocumentSection } from './common';
export type { DocumentMode, DocumentSectionInput } from './common';
export { buildSectionsFilesMarkdown } from './sectionsFiles';
export { buildSectionsFoldersMarkdown } from './sectionsFolders';
export { buildSectionsMixedMarkdown } from './sectionsMixed';

export function buildFullDocumentMarkdown(
  sections: Pick<FileNode, 'path' | 'isDir' | 'pageBreak' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>[],
  blocks: DocumentSectionInput[]
): string {
  const mode = classifyDocumentMode(sections);
  switch (mode) {
    case 'single-files':
      return buildSectionsFilesMarkdown(sections, blocks);
    case 'folders':
      return buildSectionsFoldersMarkdown(sections, blocks);
    case 'mixed':
    default:
      return buildSectionsMixedMarkdown(sections, blocks);
  }
}
