import type { Element, Root, Text } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

const TOC_DIRECTIVE = ':::toc';

/** Converts a standalone :::toc paragraph into the TOC render placeholder. */
export const tocPlaceholderPlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'p' || node.children.length !== 1) return;

      const child = node.children[0] as Text;
      if (child.type !== 'text' || child.value.trim().toLowerCase() !== TOC_DIRECTIVE) return;

      node.tagName = 'div';
      node.properties = { className: ['toc-placeholder'] };
      node.children = [];
    });
  };
};
