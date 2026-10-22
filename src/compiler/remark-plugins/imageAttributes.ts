import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

function safeLength(value: string): string {
  return /^(?:0|\d+(?:\.\d+)?(?:px|pt|mm|cm|in|em|rem|%))$/i.test(value.trim()) ? value.trim() : '';
}

function safeMargin(value: string): string {
  const parts = value.trim().split(/\s+/).map(safeLength);
  return parts.length >= 1 && parts.length <= 4 && parts.every(Boolean) ? parts.join(' ') : '';
}

type ImageAlignment = 'left' | 'center' | 'right';

function alignedImageMargin(margin: string, align: ImageAlignment | ''): string {
  if (!align) return margin;
  const parts = (margin || '0').split(' ').filter(Boolean);
  const top = parts[0] ?? '0';
  const bottom = parts.length >= 3 ? parts[2] : top;
  if (align === 'left') return `${top} auto ${bottom} 0`;
  if (align === 'right') return `${top} 0 ${bottom} auto`;
  return top === bottom ? `${top} auto` : `${top} auto ${bottom}`;
}

export const imageAttributesPlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'image', (node, index, parent) => {
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
            let align: ImageAlignment | '' = '';
            let margin = '';
            
            while ((attrMatch = attrRegex.exec(attrString)) !== null) {
              const key = attrMatch[1];
              const value = attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3] !== undefined ? attrMatch[3] : true;
              
              if (key === 'width') width = safeLength(String(value));
              else if (key === 'align') align = /^(?:left|center|right)$/.test(String(value)) ? String(value) as ImageAlignment : '';
              else if (key === 'margin') margin = safeMargin(String(value));
              else node.data.hProperties[key] = value;
            }
            
            let styleStr = '';
            if (width) styleStr += `width: ${width}; max-width: 100%; `;
            
            if (margin || align) {
              styleStr += `margin: ${alignedImageMargin(margin, align)}; `;
            }
            
            if (align) {
              // Preserve the explicit Markdown choice so project-level preview
              // defaults do not overwrite this image's alignment.
              node.data.hProperties.dataImageAlignment = align;
              styleStr += `display: block; `;
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
