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
