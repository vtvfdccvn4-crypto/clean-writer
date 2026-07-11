import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { state } from '../../state';

export const metadataSubstitutionPlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    const meta = state.get.projectMetadata;
    if (!meta) return;

    visit(tree, 'text', (node: any) => {
      let text = node.value as string;
      if (!text || !text.includes('${')) return;

      text = text.replace(/\$\{author\}/g, meta.author || '');
      text = text.replace(/\$\{documentTitle\}/g, meta.documentTitle || '');
      text = text.replace(/\$\{documentName\}/g, meta.documentName || '');
      text = text.replace(/\$\{documentNumber\}/g, meta.documentNumber || '');
      text = text.replace(/\$\{documentRevision\}/g, meta.documentRevision || '');
      text = text.replace(/\$\{documentType\}/g, meta.documentType || '');
      text = text.replace(/\$\{productName\}/g, meta.productName || '');
      text = text.replace(/\$\{productModule\}/g, meta.productModule || '');
      text = text.replace(/\$\{productVersion\}/g, meta.productVersion || '');

      node.value = text;
    });
  };
};
