import type { Plugin } from 'unified';

const STYLE_MARKER = /^\s*<!--\s*table-style\s*:\s*([12])\s*-->\s*$/i;

export const tableStylePlugin: Plugin = () => (tree: any) => {
  const visitParent = (parent: any) => {
    if (!Array.isArray(parent?.children)) return;

    for (let index = 0; index < parent.children.length; index += 1) {
      const node = parent.children[index];
      if (node?.type === 'html') {
        const match = String(node.value ?? '').match(STYLE_MARKER);
        const table = parent.children[index + 1];
        if (match && table?.type === 'table') {
          table.data = table.data || {};
          table.data.hProperties = { ...(table.data.hProperties || {}), 'data-table-style': match[1] };
          parent.children.splice(index, 1);
          index -= 1;
          continue;
        }
      }

      if (node?.type === 'table') {
        node.data = node.data || {};
        node.data.hProperties = { 'data-table-style': '1', ...(node.data.hProperties || {}) };
      }
      visitParent(node);
    }
  };

  visitParent(tree);
};
