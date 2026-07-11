import type { FileNode } from '../../state';
import type { DocumentSectionInput } from './common';
import { buildDocumentMarkdown } from './common';

export function buildSectionsMixedMarkdown(
  sections: Pick<FileNode, 'path' | 'isDir' | 'pageBreak' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>[],
  blocks: DocumentSectionInput[]
): string {
  return buildDocumentMarkdown(sections, blocks, 'mixed');
}
