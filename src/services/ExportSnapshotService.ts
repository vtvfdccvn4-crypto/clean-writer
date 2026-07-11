import {
  buildFullDocumentMarkdown,
  renderDocumentSection,
  type DocumentSectionInput
} from '../preview/document-rendering';
import type { FileNode } from '../types';
import type { WorkspaceSession, AssetResolver } from '../platform/types';
import { state } from '../state';
import { isBlockGlyphPath } from '../customBlockGlyphs';

export interface ExportSnapshotInput {
  session: WorkspaceSession;
  assetResolver: AssetResolver;
  isFullDocMode: boolean;
  activeFile: string | null;
  sections: FileNode[];
  currentMarkdown?: string;
}

export interface ExportSnapshotDependencies {
  compile(markdown: string, assetResolver: AssetResolver): Promise<string>;
}

export function scanMarkdownForImages(markdown: string): string[] {
  const paths: string[] = [];
  
  // Match standard Markdown images: ![alt](path) or ![alt](<path>)
  const mdImageRegex = /!\[.*?\]\((<([^>]+)>|([^)]+))\)/g;
  let match;
  while ((match = mdImageRegex.exec(markdown)) !== null) {
    const rawPath = match[2] || match[3];
    if (rawPath) {
      // Remove any title, e.g. path "image.jpg 'My Title'" -> "image.jpg"
      const pathPart = rawPath.split(/["']/)[0].trim();
      paths.push(pathPart);
    }
  }

  // Match HTML img tags: <img ... src="path" ... > or src='path'
  const htmlImgRegex = /<img\s+[^>]*src=["']([^"']+)["']/gi;
  while ((match = htmlImgRegex.exec(markdown)) !== null) {
    if (match[1]) {
      paths.push(match[1].trim());
    }
  }

  return Array.from(new Set(paths));
}

export function scanCustomBlockStyleIcons(): string[] {
  return Array.from(new Set(
    (state.current.customBlockStyles || [])
      .map(style => style.icon)
      .filter((icon): icon is string => Boolean(icon) && isBlockGlyphPath(icon))
  ));
}

/**
 * Builds export HTML from an explicit document snapshot rather than preview
 * cache state. Callers must flush the editor before supplying currentMarkdown.
 */
export async function compileExportSnapshot(
  input: ExportSnapshotInput,
  dependencies: ExportSnapshotDependencies
): Promise<string> {
  const { session, assetResolver, isFullDocMode, activeFile, sections, currentMarkdown } = input;

  if (isFullDocMode || !activeFile) {
    const files = sections.filter(section => !section.isDir);
    const results: Array<PromiseSettledResult<DocumentSectionInput>> = new Array(files.length);
    let nextIndex = 0;
    const readNext = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= files.length) return;
        const fileNode = files[index];
        try {
          results[index] = {
            status: 'fulfilled',
            value: {
              path: fileNode.path,
              markdown: await session.readSection(fileNode.path),
              pageBreak: fileNode.pageBreak
            }
          };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, () => readNext()));
    const failures = results
      .map((result, index) => result.status === 'rejected' ? `${files[index].path}: ${String(result.reason)}` : null)
      .filter((message): message is string => Boolean(message));
    if (failures.length > 0) {
      throw new Error(`Full document is incomplete because ${failures.length} section(s) could not be read:\n${failures.join('\n')}`);
    }

    const blocks: DocumentSectionInput[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') blocks.push(result.value);
    }
    const markdown = buildFullDocumentMarkdown(sections, blocks);
    
    // Preload images asynchronously
    const imagePaths = scanMarkdownForImages(markdown);
    await assetResolver.preloadImages([...imagePaths, ...scanCustomBlockStyleIcons()]);

    return (await dependencies.compile(markdown, assetResolver)).replace(/ data-source-line="\d+"/g, '');
  }

  const markdown = currentMarkdown ?? await session.readSection(activeFile);
  const markdownToCompile = renderDocumentSection({ path: activeFile, markdown }, sections, 0);

  // Preload images asynchronously
  const imagePaths = scanMarkdownForImages(markdownToCompile);
  await assetResolver.preloadImages([...imagePaths, ...scanCustomBlockStyleIcons()]);

  return dependencies.compile(
    markdownToCompile,
    assetResolver
  );
}
