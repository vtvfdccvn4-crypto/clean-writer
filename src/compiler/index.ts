import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

import { listMarkerPlugin, imageAttributesPlugin, imageSourcePlugin, sourceLinePlugin, customStylesPlugin, customBlockStylesPlugin, metadataSubstitutionPlugin, tableStylePlugin } from './remark-plugins';
import { listLayoutPlugin, tocPlaceholderPlugin } from './rehype-plugins';

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
  .use(sourceLinePlugin)
  .use(customStylesPlugin)
  .use(customBlockStylesPlugin, { assetResolver })
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function compileMarkdown(markdown: string, assetResolver?: AssetResolver | null): Promise<string> {
  const file = await createMarkdownCompiler(assetResolver).process(markdown);
  return String(file);
}

export function sliceMarkdownChunks(markdown: string): string[] {
  return markdown.split('\n\n');
}
