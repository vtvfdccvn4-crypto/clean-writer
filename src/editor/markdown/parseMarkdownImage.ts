import { parseMarkdownImages } from '../../images/markdownImages';

export interface EditorMarkdownImage {
  alt: string;
  attributes: string;
  end: number;
  source: string;
  start: number;
  title: string | null;
}

/** Finds Markdown images and the optional attribute block immediately following each image. */
export function parseEditorMarkdownImages(document: string): EditorMarkdownImage[] {
  return parseMarkdownImages(document).map(image => {
    const suffix = document.slice(image.end);
    const attributeMatch = suffix.match(/^(\{[^\r\n}]*\})/);
    return {
      ...image,
      end: image.end + (attributeMatch?.[1].length ?? 0),
      attributes: attributeMatch?.[1] ?? ''
    };
  });
}
