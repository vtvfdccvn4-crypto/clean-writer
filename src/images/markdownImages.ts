import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Nodes } from 'mdast';

export interface MarkdownImageMatch {
  alt: string;
  end: number;
  source: string;
  start: number;
  title: string | null;
}

const inlineMarkdownParser = unified().use(remarkParse);

/** Parse images with the same CommonMark parser used for document body Markdown. */
export function parseMarkdownImages(value: string): MarkdownImageMatch[] {
  const tree = inlineMarkdownParser.parse(value);
  const matches: MarkdownImageMatch[] = [];

  const visit = (node: Nodes) => {
    if (node.type === 'image') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        matches.push({
          alt: node.alt || '',
          end,
          source: node.url || '',
          start,
          title: node.title || null
        });
        return;
      }
    }
    if ('children' in node) node.children.forEach(visit);
  };

  visit(tree);
  return matches.sort((a, b) => a.start - b.start);
}
