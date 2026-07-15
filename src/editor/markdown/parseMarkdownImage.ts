import { parseMarkdownImages } from '../../images/markdownImages';

export interface EditorMarkdownImage {
  alt: string;
  attributes: string;
  end: number;
  isBlock: boolean;
  source: string;
  start: number;
  title: string | null;
}

/** Returns the current width attribute from an image attribute block, if present. */
export function imageWidthAttribute(attributes: string): string {
  return attributes.match(/(?:^|[\s{])width=(?:"([^"]*)"|([^\s}]*))/)?.[1]
    ?? attributes.match(/(?:^|[\s{])width=(?:"([^"]*)"|([^\s}]*))/)?.[2]
    ?? '';
}

export function imageAlignmentAttribute(attributes: string): 'left' | 'center' | 'right' | '' {
  const alignment = attributes.match(/(?:^|[\s{])align=(?:"([^"]*)"|([^\s}]*))/)?.[1]
    ?? attributes.match(/(?:^|[\s{])align=(?:"([^"]*)"|([^\s}]*))/)?.[2]
    ?? '';
  return alignment === 'left' || alignment === 'center' || alignment === 'right' ? alignment : '';
}

/** Replaces one image presentation attribute while retaining its other attributes. */
export function withImageAttribute(attributes: string, key: 'align' | 'width', value: string): string {
  const content = attributes.startsWith('{') && attributes.endsWith('}')
    ? attributes.slice(1, -1).trim()
    : '';
  const withoutAttribute = content.replace(new RegExp(`(?:^|\\s+)${key}=(?:"[^"]*"|[^\\s}]*)`, 'g'), ' ').trim();
  const next = [withoutAttribute, value ? `${key}=${value}` : ''].filter(Boolean).join(' ').trim();
  return next ? `{${next}}` : '';
}

export const withImageWidthAttribute = (attributes: string, width: string): string => withImageAttribute(attributes, 'width', width);
export const withImageAlignmentAttribute = (attributes: string, alignment: 'left' | 'center' | 'right'): string => withImageAttribute(attributes, 'align', alignment);

/** Finds Markdown images and the optional attribute block immediately following each image. */
export function parseEditorMarkdownImages(document: string): EditorMarkdownImage[] {
  return parseMarkdownImages(document).map(image => {
    const suffix = document.slice(image.end);
    const attributeMatch = suffix.match(/^(\{[^\r\n}]*\})/);
    const end = image.end + (attributeMatch?.[1].length ?? 0);
    const lineStart = document.lastIndexOf('\n', image.start - 1) + 1;
    const nextLineBreak = document.indexOf('\n', end);
    const lineEnd = nextLineBreak === -1 ? document.length : nextLineBreak;
    return {
      ...image,
      end,
      attributes: attributeMatch?.[1] ?? '',
      // Only a complete line can become a block widget. Inline Markdown stays editable inline.
      isBlock: !document.slice(lineStart, image.start).trim() && !document.slice(end, lineEnd).trim()
    };
  });
}
