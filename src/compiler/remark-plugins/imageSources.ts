import type { Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { resolveImageSource } from '../../images/imageSources';
import type { AssetResolver } from '../../platform/types';

interface ImageSourceOptions {
  assetResolver?: AssetResolver | null;
}

export const imageSourcePlugin: Plugin<[ImageSourceOptions?], Root> = (options = {}) => {
  return (tree: Root) => {
    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'img' || typeof node.properties?.src !== 'string') return;

      const originalSource = node.properties.src;
      node.properties.src = resolveImageSource(originalSource, options.assetResolver);
      node.properties.dataImageSource = originalSource;
    });
  };
};
