import {
  buildFullDocumentPreviewInput,
  renderDocumentSection,
  type DocumentPreviewSourceSegment,
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
  signal?: AbortSignal;
  onPhase?: (phase: 'snapshot-load' | 'asset-preload', durationMs: number) => void;
}

export interface ExportSnapshotDependencies<T = string> {
  compile(
    markdown: string,
    assetResolver: AssetResolver,
    sourceSegments?: readonly DocumentPreviewSourceSegment[]
  ): Promise<T>;
}

function scanMarkdownForImages(markdown: string): string[] {
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

  return paths;
}

function scanCustomBlockStyleIcons(): string[] {
  return (state.current.customBlockStyles || [])
    .map(style => style.icon)
    .filter((icon): icon is string => Boolean(icon) && isBlockGlyphPath(icon));
}

/** Collects each document image and configured block glyph once per operation. */
function collectDocumentAssetPaths(markdown: string): string[] {
  return [...new Set([
    ...scanMarkdownForImages(markdown),
    ...scanCustomBlockStyleIcons()
  ])];
}

export async function preloadDocumentAssets(
  markdown: string,
  assetResolver: AssetResolver,
  signal?: AbortSignal
): Promise<void> {
  const assets = collectDocumentAssetPaths(markdown);
  if (assets.length > 0) await assetResolver.preloadImages(assets, signal);
}

/**
 * Builds export HTML from an explicit document snapshot rather than preview
 * cache state. Callers must flush the editor before supplying currentMarkdown.
 */
export async function compileExportSnapshot<T = string>(
  input: ExportSnapshotInput,
  dependencies: ExportSnapshotDependencies<T>
): Promise<T> {
  const { session, assetResolver, isFullDocMode, activeFile, sections, currentMarkdown, signal } = input;
  throwIfAborted(signal);

  if (isFullDocMode || !activeFile) {
    const files = sections.filter(section => !section.isDir);
    const results: Array<PromiseSettledResult<DocumentSectionInput>> = new Array(files.length);
    let nextIndex = 0;
    const snapshotStartedAt = performance.now();
    const readNext = async () => {
      while (true) {
        throwIfAborted(signal);
        const index = nextIndex++;
        if (index >= files.length) return;
        const fileNode = files[index];
        try {
          const markdown = await session.readSection(fileNode.path);
          throwIfAborted(signal);
          results[index] = {
            status: 'fulfilled',
            value: {
              path: fileNode.path,
              markdown,
              pageBreak: fileNode.pageBreak
            }
          };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, () => readNext()));
    } finally {
      input.onPhase?.('snapshot-load', performance.now() - snapshotStartedAt);
    }
    throwIfAborted(signal);
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
    const document = buildFullDocumentPreviewInput(sections, blocks);
    
    const assetPreloadStartedAt = performance.now();
    try {
      await preloadDocumentAssets(document.markdown, assetResolver, signal);
    } finally {
      input.onPhase?.('asset-preload', performance.now() - assetPreloadStartedAt);
    }

    throwIfAborted(signal);
    return dependencies.compile(document.markdown, assetResolver, document.sourceSegments);
  }

  const markdown = currentMarkdown ?? await session.readSection(activeFile);
  throwIfAborted(signal);
  const markdownToCompile = renderDocumentSection({ path: activeFile, markdown }, sections, 0);

  const assetPreloadStartedAt = performance.now();
  try {
    await preloadDocumentAssets(markdownToCompile, assetResolver, signal);
  } finally {
    input.onPhase?.('asset-preload', performance.now() - assetPreloadStartedAt);
  }

  throwIfAborted(signal);
  return dependencies.compile(
    markdownToCompile,
    assetResolver
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Export snapshot was cancelled.', 'AbortError');
}
