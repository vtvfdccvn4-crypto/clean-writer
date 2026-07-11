import type { FileNode } from '../../state';
import { getParentPath } from '../../utils/path-utils';
import { resolveSectionVisibility } from '../../visibility/sectionVisibility';

export type DocumentMode = 'single-files' | 'folders' | 'mixed';

export interface DocumentSectionInput {
  path: string;
  markdown: string;
  pageBreak?: boolean;
}

export { getParentPath } from '../../utils/path-utils';

export function classifyDocumentMode(sections: Pick<FileNode, 'path' | 'isDir'>[]): DocumentMode {
  const hasRootFiles = sections.some(section => !section.isDir && getParentPath(section.path) === null);
  const hasNestedFiles = sections.some(section => !section.isDir && getParentPath(section.path) !== null);

  if (hasRootFiles && hasNestedFiles) return 'mixed';
  if (hasNestedFiles) return 'folders';
  return 'single-files';
}

export function buildDocumentMarkdown(
  sections: Pick<FileNode, 'path' | 'isDir' | 'pageBreak' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>[],
  blocks: DocumentSectionInput[],
  mode: DocumentMode
): string {
  const includeBlock = (block: DocumentSectionInput) => {
    const parentPath = getParentPath(block.path);
    if (mode === 'single-files') return parentPath === null;
    if (mode === 'folders') return parentPath !== null;
    return true;
  };

  return blocks
    .filter(includeBlock)
    .map((block, index) => renderDocumentSection(block, sections, index))
    .join('\n\n');
}

export function renderDocumentSection(
  block: DocumentSectionInput,
  sections: Pick<FileNode, 'path' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>[],
  index: number
): string {
  const visibility = resolveSectionVisibility(sections, block.path);
  const pageBreak = block.pageBreak ? `<div class="section-break">&nbsp;</div>\n\n` : '';

  return `<div class="document-section" data-section-index="${index}" data-section-path="${escapeHtmlAttribute(block.path)}" data-hide-header="${visibility.hideHeader.toString()}" data-hide-footer="${visibility.hideFooter.toString()}" data-number-headings="${visibility.numberHeadings.toString()}" data-include-in-toc="${visibility.includeInToc.toString()}">

${pageBreak}${block.markdown}

</div>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
