import type { Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { state } from '../../state';

/** Converts configured :::directives into semantic headings before document assembly. */
export const specialHeadingsPlugin: Plugin<[], Root> = () => tree => {
  const definitions = state.current.pageSetup.specialHeadings || [];
  visit(tree, 'element', (node: any) => {
    if (node.tagName !== 'p' || node.children?.[0]?.type !== 'text') return;
    const text = node.children[0].value as string;
    if (text.trim() === ':::pagebreak') {
      node.tagName = 'div';
      node.children = [];
      node.properties = { ...(node.properties || {}), className: ['section-break'] };
      return;
    }
    const definition = definitions.find(item => text.startsWith(item.directive));
    if (!definition) return;
    node.children[0].value = text.slice(definition.directive.length).trimStart();
    node.tagName = `h${Math.min(6, Math.max(1, definition.headingLevel))}`;
    node.properties = {
      ...(node.properties || {}),
      className: ['special-heading'],
      dataSpecialHeadingId: definition.id,
      dataIncludeInToc: String(definition.includeInToc),
      dataBreakBefore: String(definition.breakBefore)
    };
  });
};
