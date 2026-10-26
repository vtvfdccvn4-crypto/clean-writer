import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

const EXTERNAL_HREF = /^https?:\/\//i;

/**
 * Opens web links in a new browsing context without access to the app. Without
 * this, clicking a link in the preview navigates the app away from its document.
 * Runs after sanitizing, so the attributes are not stripped.
 */
export const externalLinkPlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href !== 'string' || !EXTERNAL_HREF.test(href)) return;
      node.properties = { ...node.properties, target: '_blank', rel: ['noopener', 'noreferrer'] };
    });
  };
};
