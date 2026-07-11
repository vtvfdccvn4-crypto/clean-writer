import type { Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

export const listMarkerPlugin: Plugin<[], Root> = () => {
  return (tree: Root, file: any) => {
    const source = String(file);
    visit(tree, 'list', (node: any) => {
      if (!node.position?.start || !Number.isInteger(node.position.start.offset)) return;

      const offset = node.position.start.offset as number;
      node.data = node.data || {};
      node.data.hProperties = node.data.hProperties || {};

      if (!node.ordered) {
        const char = source[offset];
        if (char === '*') node.data.hProperties['data-marker'] = 'asterisk';
        else if (char === '-') node.data.hProperties['data-marker'] = 'dash';
        else if (char === '+') node.data.hProperties['data-marker'] = 'plus';
        return;
      }

      const orderedMarker = source.slice(offset).match(/^\d{1,9}([.)])/);
      node.data.hProperties['data-marker'] = orderedMarker?.[1] === ')' ? 'paren' : 'period';
    });
  };
};
