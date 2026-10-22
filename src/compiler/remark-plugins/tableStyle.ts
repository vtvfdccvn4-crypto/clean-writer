import type { Parent, Root } from 'mdast';
import type { Plugin } from 'unified';

const STYLE_MARKER = /^\s*<!--\s*table-style\s*:\s*([12])\s*-->\s*$/i;

export const tableStylePlugin: Plugin<[], Root> = () => (tree: Root) => {
  const visitParent = (parent: Parent) => {
    for (let index = 0; index < parent.children.length; index += 1) {
      const node = parent.children[index];
      if (node.type === 'html') {
        const match = node.value.match(STYLE_MARKER);
        const table = parent.children[index + 1];
        if (match && table?.type === 'table') {
          table.data = table.data || {};
          table.data.hProperties = { ...(table.data.hProperties || {}), 'data-table-style': match[1] };
          parent.children.splice(index, 1);
          index -= 1;
          continue;
        }
      }

      if (node.type === 'table') {
        node.data = node.data || {};
        node.data.hProperties = { 'data-table-style': '1', ...(node.data.hProperties || {}) };
      }
      if ('children' in node) visitParent(node);
    }
  };

  visitParent(tree);
};
