import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';

export interface PreviewSourceRange {
  startLine: number;
  endLine: number;
}

/**
 * An in-memory locator for a navigable source block. It is deliberately not
 * serialized into preview or export HTML.
 */
export interface PreviewSourceManifestEntry {
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
          manifest.push({
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
