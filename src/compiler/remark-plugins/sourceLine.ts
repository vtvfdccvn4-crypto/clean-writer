import type { Root, Element } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

export const sourceLinePlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    let sourceAnchorOrdinal = 0;
    const applySourceAnchor = (node: Element) => {
      if (!node.position?.start) return;
      node.properties = node.properties || {};
      const start = node.position.start.line;
      const end = node.position.end?.line ?? start;
      node.properties['data-source-line'] = String(start);
      node.properties['data-source-start'] = String(start);
      node.properties['data-source-end'] = String(Math.max(start, end));
      node.properties['data-source-id'] = `source-${start}-${end}-${sourceAnchorOrdinal++}`;
    };

    tree.children.forEach((node) => {
      if (node.type === 'element' && node.position && node.position.start) {
        applySourceAnchor(node);
      }
    });
    
    visit(tree, 'element', (node: Element) => {
       if (node.tagName === 'li' && node.position && node.position.start) {
          applySourceAnchor(node);
       }
    });
  };
};
