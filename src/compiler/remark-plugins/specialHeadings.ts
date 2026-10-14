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
      replaceWithPageBreak(node);
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

  // Section previews are wrapped in raw HTML so they can carry section
  // metadata. Markdown inside that wrapper is not parsed into paragraphs,
  // which leaves a standalone page-break directive as a text node instead of
  // the paragraph handled above.
  visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
    if (index === undefined || !parent || node.value.trim() !== ':::pagebreak') return;
    if (parent.tagName === 'code' || parent.tagName === 'pre') return;

    const value = node.value as string;
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    const replacement = [
      ...(leading ? [{ type: 'text', value: leading }] : []),
      createPageBreakNode(),
      ...(trailing ? [{ type: 'text', value: trailing }] : [])
    ];
    parent.children.splice(index, 1, ...replacement);
  });
};

function replaceWithPageBreak(node: any): void {
  node.tagName = 'div';
  node.children = [];
  node.properties = {
    ...(node.properties || {}),
    className: ['section-break'],
    dataExplicitPageBreak: 'true'
  };
}

function createPageBreakNode(): any {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['section-break'], dataExplicitPageBreak: 'true' },
    children: []
  };
}
