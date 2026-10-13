import { parseEditorMarkdownImages, type EditorMarkdownImage } from '../markdown/parseMarkdownImage';

export interface ImageBlockRange {
  from: number;
  markdown: string;
  to: number;
}

export interface ImageBlockMove {
  changes: Array<{ from: number; to: number; insert: string }>;
  selectionAnchor: number;
}

function lineRangeAt(document: string, position: number): { from: number; to: number } {
  const safePosition = Math.max(0, Math.min(position, document.length));
  const from = document.lastIndexOf('\n', safePosition - 1) + 1;
  const lineEnd = document.indexOf('\n', safePosition);
  return { from, to: lineEnd === -1 ? document.length : lineEnd };
}

function imageBlockRange(document: string, image: EditorMarkdownImage): ImageBlockRange {
  const line = lineRangeAt(document, image.start);
  return {
    from: line.from,
    to: line.to < document.length ? line.to + 1 : line.to,
    markdown: document.slice(line.from, line.to)
  };
}

/** Finds the standalone image block represented by a current editor position. */
export function getImageBlockAtPosition(document: string, position: number): ImageBlockRange | null {
  const image = parseEditorMarkdownImages(document).find(candidate =>
    candidate.isBlock && position >= candidate.start && position <= candidate.end
  );
  return image ? imageBlockRange(document, image) : null;
}

function lineInsertion(document: string, position: number, markdown: string): { insert: string; selectionAnchor: number } {
  const needsLeadingBreak = position > 0 && document.charAt(position - 1) !== '\n';
  const needsTrailingBreak = position < document.length && document.charAt(position) !== '\n';
  const prefix = needsLeadingBreak ? '\n' : '';
  const suffix = needsTrailingBreak ? '\n' : '';
  return {
    insert: `${prefix}${markdown}${suffix}`,
    selectionAnchor: position + prefix.length + markdown.length
  };
}

/**
 * Produces sequential CodeMirror changes for moving or copying an image-only
 * Markdown line. Callers apply both move changes in one transaction.
 */
export function buildImageBlockMove(
  document: string,
  source: ImageBlockRange,
  destination: number,
  copy: boolean
): ImageBlockMove | null {
  if (!source.markdown || source.from < 0 || source.to < source.from || source.to > document.length) return null;
  if (document.slice(source.from, source.to).replace(/\n$/, '') !== source.markdown) return null;
  if (destination >= source.from && destination < source.to) return null;
  if (!copy && destination === source.to) return null;

  const destinationAfterRemoval = copy || destination < source.from
    ? destination
    : destination - (source.to - source.from);
  const documentAfterRemoval = copy
    ? document
    : `${document.slice(0, source.from)}${document.slice(source.to)}`;
  const insertion = lineInsertion(documentAfterRemoval, destinationAfterRemoval, source.markdown);
  // The move insertion uses the post-removal coordinate for downward moves.
  const changes = copy
    ? [{ from: destination, to: destination, insert: insertion.insert }]
    : [
      { from: source.from, to: source.to, insert: '' },
      { from: destinationAfterRemoval, to: destinationAfterRemoval, insert: insertion.insert }
    ];

  return { changes, selectionAnchor: insertion.selectionAnchor };
}
