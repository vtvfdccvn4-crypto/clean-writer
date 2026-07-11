import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

const MARKER_CLASS = 'document-list-marker';
const CONTENT_CLASS = 'document-list-content';

/**
 * Gives list items explicit marker and content columns.
 *
 * Native list markers do not expose a dependable marker-to-text gap,
 * while absolutely positioned pseudo-elements can escape the page content box.
 * Keeping the two columns in the document tree lets CSS lay them out normally
 * and keeps wrapped lines, block content, and nested lists aligned.
 */
export const listLayoutPlugin: Plugin<[], Root> = () => tree => {
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'ul' && node.tagName !== 'ol') return;

    for (const child of node.children) {
      if (child.type !== 'element' || child.tagName !== 'li') continue;

      const originalChildren = child.children;
      child.children = [
        {
          type: 'element',
          tagName: 'span',
          properties: { className: [MARKER_CLASS], ariaHidden: 'true' },
          children: []
        },
        {
          type: 'element',
          tagName: 'div',
          properties: { className: [CONTENT_CLASS] },
          children: originalChildren
        }
      ];
    }
  });
};
