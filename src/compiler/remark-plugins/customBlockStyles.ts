import type { Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { state } from '../../state';
import { isBlockGlyphPath } from '../../customBlockGlyphs';
import { resolveImageSource } from '../../images/imageSources';

import type { AssetResolver } from '../../platform/types';

interface CustomBlockStylesOptions {
  assetResolver?: AssetResolver | null;
}

export const customBlockStylesPlugin: Plugin<[CustomBlockStylesOptions?], Root> = (options = {}) => {
  return (tree: Root) => {
    const blockStyles = state.get.customBlockStyles || [];
    if (blockStyles.length === 0) return;

    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'p') return;
      if (!node.children || node.children.length === 0) return;
      
      const firstChild = node.children[0];
      if (firstChild.type !== 'text') return;
      
      const text = firstChild.value as string;
      
      for (const style of blockStyles) {
        if (text.startsWith(style.prefix)) {
          // Matched a block style!
          // Remove the prefix from the text
          firstChild.value = text.slice(style.prefix.length).trimStart();
          
          const cssProps = [];
          if (style.fontFamily) cssProps.push(`font-family: ${style.fontFamily}`);
          if (style.fontSize) cssProps.push(`font-size: ${style.fontSize}pt`);
          if (style.color) cssProps.push(`color: ${style.color}`);
          if (style.isBold) cssProps.push(`font-weight: bold`);
          if (style.isItalic) cssProps.push(`font-style: italic`);
          const paragraphSpacing = state.get.typographySetup.paragraph;
          cssProps.push(`line-height: ${style.lineHeight ?? paragraphSpacing.lineHeight}`);
          cssProps.push(`margin-top: ${style.marginTop ?? paragraphSpacing.marginTop}pt`);
          cssProps.push(`margin-bottom: ${style.marginBottom ?? paragraphSpacing.marginBottom}pt`);
          
          if (style.icon) {
            // Inject icon node
            node.children.unshift(isBlockGlyphPath(style.icon) ? {
              type: 'element',
              tagName: 'img',
              properties: {
                className: ['custom-block-icon', 'custom-block-glyph'],
                src: resolveImageSource(style.icon, options.assetResolver),
                dataImageSource: style.icon,
                alt: '',
                ariaHidden: 'true'
              },
              children: []
            } : {
              type: 'element',
              tagName: 'span',
              properties: { className: ['custom-block-icon'] },
              children: [{ type: 'text', value: style.icon }]
            });
          }

          // Convert the paragraph to a styled div
          node.tagName = 'div';
          node.properties = node.properties || {};
          node.properties.className = ['custom-block-style'];
          node.properties.style = cssProps.join('; ');
          node.properties['data-custom-block-id'] = style.id;
          
          // Stop checking other block styles for this paragraph
          break;
        }
      }
    });
  };
};
