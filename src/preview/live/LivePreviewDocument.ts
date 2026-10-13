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
  root: ParentNode,
  manifest: readonly PreviewSourceManifestEntry[]
): LivePreviewDocument {
  const elements = Array.from(root.children);
  const manifestByBlock = indexManifestByBlock(elements, manifest);
  const blocks: LivePreviewBlock[] = [];
  elements.forEach((element, sectionIndex) => {
    if (!element.classList.contains('document-section')) {
      blocks.push(createBlock(
        element,
        sectionIndex,
        0,
        manifestByBlock.get(blockKey(sectionIndex, 0)) ?? [],
        {},
        1
      ));
      return;
    }

    const sectionAttributes = Object.fromEntries(
      Array.from(element.attributes).map(attribute => [attribute.name, attribute.value])
    );
    Array.from(element.children).forEach((child, childIndex) => {
      blocks.push(createBlock(
        child,
        sectionIndex,
        childIndex,
        manifestByBlock.get(blockKey(sectionIndex, childIndex)) ?? [],
        sectionAttributes,
        2
      ));
    });
  });

  return { manifest, blocks };
}

function createBlock(
  element: Element,
  sectionIndex: number,
  childIndex: number,
  blockManifest: readonly PreviewSourceManifestEntry[],
  sectionAttributes: Readonly<Record<string, string>>,
  sourcePathDepth: number
): LivePreviewBlock {
  return {
    id: createBlockId(element, `${sectionIndex}:${childIndex}`, blockManifest),
    html: element.outerHTML,
    tagName: element.tagName.toLowerCase(),
    manifest: blockManifest,
    sectionAttributes,
    sourcePathDepth
  };
}

function indexManifestByBlock(
  elements: readonly Element[],
  manifest: readonly PreviewSourceManifestEntry[]
): Map<string, PreviewSourceManifestEntry[]> {
  const buckets = new Map<string, PreviewSourceManifestEntry[]>();
  const append = (sectionIndex: number, childIndex: number, entry: PreviewSourceManifestEntry) => {
    const key = blockKey(sectionIndex, childIndex);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  };

  manifest.forEach(entry => {
    const sectionIndex = entry.elementPath[0];
    const element = elements[sectionIndex];
    if (!element) return;

    if (!element.classList.contains('document-section')) {
      if (entry.elementPath.length < 2 || entry.elementPath[1] === 0) {
        append(sectionIndex, 0, entry);
      }
      return;
    }

    const childIndex = entry.elementPath[1];
    if (childIndex !== undefined) {
      if (childIndex < element.children.length) append(sectionIndex, childIndex, entry);
      return;
    }

    // Section-level entries apply to every child, matching the previous filter.
    for (let index = 0; index < element.children.length; index += 1) {
      append(sectionIndex, index, entry);
    }
  });

  return buckets;
}

function blockKey(sectionIndex: number, childIndex: number): string {
  return `${sectionIndex}:${childIndex}`;
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
