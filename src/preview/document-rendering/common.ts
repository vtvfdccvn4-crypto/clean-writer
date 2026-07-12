import type { FileNode } from '../../state';
import { getParentPath } from '../../utils/path-utils';
import { resolveSectionVisibility } from '../../visibility/sectionVisibility';

export type DocumentMode = 'single-files' | 'folders' | 'mixed';

export interface DocumentSectionInput {
  path: string;
  markdown: string;
  pageBreak?: boolean;
}

export interface DocumentPreviewSourceSegment {
  filePath: string;
  generatedStartLine: number;
  generatedEndLine: number;
  sourceStartLine: number;
}

export interface DocumentPreviewInput {
  markdown: string;
  sourceSegments: DocumentPreviewSourceSegment[];
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
  return buildDocumentPreviewInput(sections, blocks, mode).markdown;
}

export function buildDocumentPreviewInput(
  sections: Pick<FileNode, 'path' | 'isDir' | 'pageBreak' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>[],
  blocks: DocumentSectionInput[],
  mode: DocumentMode
): DocumentPreviewInput {
  const includeBlock = (block: DocumentSectionInput) => {
    const parentPath = getParentPath(block.path);
    if (mode === 'single-files') return parentPath === null;
    if (mode === 'folders') return parentPath !== null;
    return true;
  };

  const renderedSections = blocks
    .filter(includeBlock)
    .map((block, index) => ({ block, markdown: renderDocumentSection(block, sections, index) }));
  const sourceSegments: DocumentPreviewSourceSegment[] = [];
  let generatedLine = 1;

  renderedSections.forEach(({ block, markdown }, index) => {
    const sourceStartLine = generatedLine + (block.pageBreak ? 4 : 2);
    const sourceLineCount = Math.max(1, block.markdown.split(/\r?\n/).length);
    sourceSegments.push({
      filePath: block.path,
      generatedStartLine: sourceStartLine,
      generatedEndLine: sourceStartLine + sourceLineCount - 1,
      sourceStartLine: 1
    });
    generatedLine += markdown.split('\n').length;
    if (index < renderedSections.length - 1) generatedLine += 2;
  });

  return {
    markdown: renderedSections.map(section => section.markdown).join('\n\n'),
    sourceSegments
  };
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
