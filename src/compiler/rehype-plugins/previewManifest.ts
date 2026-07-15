import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';

export interface PreviewSourceRange {
  startLine: number;
  endLine: number;
}

/**
 * Locator for a navigable source block. Its anchor is serialized only into
 * preview HTML so Paged.js can report physical page boundaries.
 */
export interface PreviewSourceManifestEntry {
  /** Stable DOM reference retained by Paged.js when it creates physical pages. */
  anchor: string;
  range: PreviewSourceRange;
  elementPath: number[];
  priority: number;
  filePath?: string;
}

export const previewManifestPlugin: Plugin<[], Root> = () => {
  return (tree, file) => {
    const manifest: PreviewSourceManifestEntry[] = [];

    const visitChildren = (parent: Root | Element, parentPath: number[]) => {
      let elementIndex = 0;
      for (const child of parent.children) {
        if (child.type !== 'element') continue;

        const elementPath = [...parentPath, elementIndex++];
        if (isNavigableBlock(child) && child.position?.start) {
          const anchor = `preview-source-${elementPath.join('-')}`;
          // This attribute is intentionally part of the preview HTML. It lets
          // the paginated renderer map a physical page boundary back to a
          // canonical source block without modifying the Markdown source.
          child.properties.dataRef = anchor;
          manifest.push({
            anchor,
            range: {
              startLine: child.position.start.line,
              endLine: Math.max(child.position.start.line, child.position.end?.line ?? child.position.start.line)
            },
            elementPath,
            priority: elementPath.length
          });
        }
        visitChildren(child, elementPath);
      }
    };

    visitChildren(tree, []);
    file.data.previewSourceManifest = manifest;
  };
};

function isNavigableBlock(node: Element): boolean {
  if (/^h[1-6]$/.test(node.tagName)) return true;

  switch (node.tagName) {
    case 'p':
    case 'li':
    case 'blockquote':
    case 'pre':
    case 'table':
    case 'hr':
    case 'img':
      return true;
    case 'div':
      return hasClass(node, 'custom-block-style');
    default:
      return false;
  }
}

function hasClass(node: Element, className: string): boolean {
  const value = node.properties.className;
  if (Array.isArray(value)) return value.includes(className);
  return value === className;
}
