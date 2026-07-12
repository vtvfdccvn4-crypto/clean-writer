import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

import { listMarkerPlugin, imageAttributesPlugin, imageSourcePlugin, customStylesPlugin, customBlockStylesPlugin, specialHeadingsPlugin, metadataSubstitutionPlugin, tableStylePlugin } from './remark-plugins';
import { listLayoutPlugin, tocPlaceholderPlugin, previewManifestPlugin, type PreviewSourceManifestEntry } from './rehype-plugins';

const documentSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'className',
      'dataSectionIndex',
      'dataSectionPath',
      'dataHideHeader',
      'dataHideFooter',
      'dataNumberHeadings',
      'dataIncludeInToc'
    ],
    img: [...(defaultSchema.attributes?.img ?? []), 'style'],
    ul: [...(defaultSchema.attributes?.ul ?? []), 'dataMarker'],
    ol: [...(defaultSchema.attributes?.ol ?? []), 'dataMarker'],
    table: [...(defaultSchema.attributes?.table ?? []), 'dataTableStyle']
  }
};

import type { AssetResolver } from '../platform/types';

const createMarkdownCompiler = (assetResolver?: AssetResolver | null) => unified()
  .use(remarkParse)
  .use(listMarkerPlugin)
  .use(imageAttributesPlugin)
  .use(remarkGfm)
  .use(tableStylePlugin)
  .use(metadataSubstitutionPlugin)
  .use(remarkRehype, { allowDangerousHtml: true })
  // Parse raw HTML into nodes, then remove scripts, event handlers and unsafe
  // elements before any HTML reaches the browser preview or export pipeline.
  .use(rehypeRaw)
  .use(rehypeSanitize, documentSchema)
  .use(tocPlaceholderPlugin)
  .use(listLayoutPlugin)
  .use(imageSourcePlugin, { assetResolver })
  .use(customStylesPlugin)
  .use(customBlockStylesPlugin, { assetResolver })
  .use(specialHeadingsPlugin)
  .use(previewManifestPlugin)
  .use(rehypeStringify, { allowDangerousHtml: true });

export interface CompiledPreview {
  html: string;
  manifest: PreviewSourceManifestEntry[];
}

export interface PreviewCompilationOptions {
  /** Number of generated wrapper lines preceding the editor's Markdown. */
  sourceLineOffset?: number;
  /** Source-file ranges embedded in a generated multi-section document. */
  sourceSegments?: readonly PreviewSourceSegment[];
}

export interface PreviewSourceSegment {
  filePath: string;
  generatedStartLine: number;
  generatedEndLine: number;
  sourceStartLine: number;
}

export async function compileMarkdown(markdown: string, assetResolver?: AssetResolver | null): Promise<string> {
  return (await compilePreviewDocument(markdown, assetResolver)).html;
}

/** Compiles preview HTML and an in-memory source manifest without emitting source markers. */
export async function compilePreviewDocument(
  markdown: string,
  assetResolver?: AssetResolver | null,
  options: PreviewCompilationOptions = {}
): Promise<CompiledPreview> {
  const file = await createMarkdownCompiler(assetResolver).process(markdown);
  const manifest = file.data.previewSourceManifest;
  const sourceLineOffset = Math.max(0, options.sourceLineOffset ?? 0);
  return {
    html: String(file),
    manifest: Array.isArray(manifest)
      ? rebaseManifest(manifest as PreviewSourceManifestEntry[], sourceLineOffset, options.sourceSegments)
      : []
  };
}

function rebaseManifest(
  manifest: readonly PreviewSourceManifestEntry[],
  sourceLineOffset: number,
  sourceSegments: readonly PreviewSourceSegment[] | undefined
): PreviewSourceManifestEntry[] {
  return manifest.map(entry => {
    const segment = sourceSegments?.find(candidate =>
      entry.range.startLine >= candidate.generatedStartLine
      && entry.range.endLine <= candidate.generatedEndLine
    );
    if (segment) {
      return {
        ...entry,
        filePath: segment.filePath,
        range: {
          startLine: segment.sourceStartLine + entry.range.startLine - segment.generatedStartLine,
          endLine: segment.sourceStartLine + entry.range.endLine - segment.generatedStartLine
        }
      };
    }
    if (sourceLineOffset === 0) return { ...entry };
    return {
      ...entry,
      range: {
        startLine: Math.max(1, entry.range.startLine - sourceLineOffset),
        endLine: Math.max(1, entry.range.endLine - sourceLineOffset)
      }
    };
  });
}

export function sliceMarkdownChunks(markdown: string): string[] {
  return markdown.split('\n\n');
}
