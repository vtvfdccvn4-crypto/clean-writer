import type { Root, Element } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

export const sourceLinePlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    tree.children.forEach((node) => {
      if (node.type === 'element' && node.position && node.position.start) {
        node.properties = node.properties || {};
        node.properties['data-source-line'] = String(node.position.start.line);
      }
    });
    
    visit(tree, 'element', (node: Element) => {
       if (node.tagName === 'li' && node.position && node.position.start) {
          node.properties = node.properties || {};
          node.properties['data-source-line'] = String(node.position.start.line);
       }
    });
  };
};
