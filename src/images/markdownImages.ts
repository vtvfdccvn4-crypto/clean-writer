import { unified } from 'unified';
import remarkParse from 'remark-parse';

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
  const tree = inlineMarkdownParser.parse(value) as any;
  const matches: MarkdownImageMatch[] = [];

  const visit = (node: any) => {
    if (node.type === 'image' && node.position?.start?.offset !== undefined && node.position?.end?.offset !== undefined) {
      matches.push({
        alt: node.alt || '',
        end: node.position.end.offset,
        source: node.url || '',
        start: node.position.start.offset,
        title: node.title || null
      });
      return;
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };

  visit(tree);
  return matches.sort((a, b) => a.start - b.start);
}
