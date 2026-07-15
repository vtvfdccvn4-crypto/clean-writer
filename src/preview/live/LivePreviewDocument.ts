import type { PreviewSourceManifestEntry } from '../../compiler/rehype-plugins';

export interface LivePreviewBlock {
  /** Stable enough for edits within a block; reconciliation handles insertions around it. */
  id: string;
  html: string;
  tagName: string;
  manifest: readonly PreviewSourceManifestEntry[];
  sectionAttributes: Readonly<Record<string, string>>;
  /** Number of original element-path segments represented by the block root. */
  sourcePathDepth: number;
}

export interface LivePreviewDocument {
  blocks: readonly LivePreviewBlock[];
  manifest: readonly PreviewSourceManifestEntry[];
}

/**
 * Converts compiler output into the live renderer's smallest safe replacement
 * unit. We intentionally use top-level HTML elements here: splitting nested
 * list/table/custom-block children independently would break their semantics.
 */
export function createLivePreviewDocument(
  html: string,
  manifest: readonly PreviewSourceManifestEntry[]
): LivePreviewDocument {
  const template = document.createElement('template');
  template.innerHTML = html;
  const elements = Array.from(template.content.children);

  const blocks: LivePreviewBlock[] = [];
  elements.forEach((element, sectionIndex) => {
    if (!element.classList.contains('document-section')) {
      blocks.push(createBlock(element, sectionIndex, 0, manifest, {}, 1));
      return;
    }

    const sectionAttributes = Object.fromEntries(
      Array.from(element.attributes).map(attribute => [attribute.name, attribute.value])
    );
    Array.from(element.children).forEach((child, childIndex) => {
      blocks.push(createBlock(child, sectionIndex, childIndex, manifest, sectionAttributes, 2));
    });
  });

  return { manifest, blocks };
}

function createBlock(
  element: Element,
  sectionIndex: number,
  childIndex: number,
  manifest: readonly PreviewSourceManifestEntry[],
  sectionAttributes: Readonly<Record<string, string>>,
  sourcePathDepth: number
): LivePreviewBlock {
  const blockManifest = manifest.filter(entry =>
    entry.elementPath[0] === sectionIndex
    && (entry.elementPath.length < 2 || entry.elementPath[1] === childIndex)
  );
  return {
    id: createBlockId(element, `${sectionIndex}:${childIndex}`, blockManifest),
    html: element.outerHTML,
    tagName: element.tagName.toLowerCase(),
    manifest: blockManifest,
    sectionAttributes,
    sourcePathDepth
  };
}

function createBlockId(
  element: Element,
  structuralPosition: string,
  manifest: readonly PreviewSourceManifestEntry[]
): string {
  const first = manifest[0];
  if (!first) return `structural:${element.tagName.toLowerCase()}:${structuralPosition}`;
  return [
    first.filePath ?? 'active-document',
    first.range.startLine,
    element.tagName.toLowerCase()
  ].join(':');
}
