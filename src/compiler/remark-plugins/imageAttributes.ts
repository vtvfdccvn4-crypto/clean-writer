import type { Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

function safeLength(value: string): string {
  return /^(?:0|\d+(?:\.\d+)?(?:px|pt|mm|cm|in|em|rem|%))$/i.test(value.trim()) ? value.trim() : '';
}

function safeMargin(value: string): string {
  const parts = value.trim().split(/\s+/).map(safeLength);
  return parts.length >= 1 && parts.length <= 4 && parts.every(Boolean) ? parts.join(' ') : '';
}

export const imageAttributesPlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'image', (node: any, index: number | undefined, parent: any) => {
      if (parent && typeof index === 'number' && index < parent.children.length - 1) {
        const nextNode = parent.children[index + 1];
        if (nextNode.type === 'text' && nextNode.value.startsWith('{')) {
          const match = nextNode.value.match(/^\{([^}]+)\}/);
          if (match) {
            const attrString = match[1];
            nextNode.value = nextNode.value.slice(match[0].length);
            
            node.data = node.data || {};
            node.data.hProperties = node.data.hProperties || {};
            
            const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|([^ ]*)))?/g;
            let attrMatch;
            let width = '';
            let align = '';
            let margin = '';
            
            while ((attrMatch = attrRegex.exec(attrString)) !== null) {
              const key = attrMatch[1];
              const value = attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3] !== undefined ? attrMatch[3] : true;
              
              if (key === 'width') width = safeLength(String(value));
              else if (key === 'align') align = /^(?:left|center|right)$/.test(String(value)) ? String(value) : '';
              else if (key === 'margin') margin = safeMargin(String(value));
              else node.data.hProperties[key] = value;
            }
            
            let styleStr = '';
            if (width) styleStr += `width: ${width}; max-width: 100%; `;
            
            if (margin) {
              if (align === 'center') {
                const parts = margin.split(' ').filter(Boolean);
                if (parts.length === 2) {
                  styleStr += `margin: ${parts[0]} auto; `;
                } else {
                  styleStr += `margin: ${margin}; `;
                }
              } else {
                styleStr += `margin: ${margin}; `;
              }
            } else if (align === 'center') {
              styleStr += `margin: 0 auto; `;
            }
            
            if (align) {
              // Preserve the explicit Markdown choice so project-level preview
              // defaults do not overwrite this image's alignment.
              node.data.hProperties.dataImageAlignment = align;
              styleStr += `display: block; `;
              if (align === 'left') styleStr += `margin-right: auto; `;
              if (align === 'right') styleStr += `margin-left: auto; `;
            }
            
            if (styleStr) {
              node.data.hProperties.style = (node.data.hProperties.style || '') + styleStr;
            }
          }
        }
      }
    });
  };
};
