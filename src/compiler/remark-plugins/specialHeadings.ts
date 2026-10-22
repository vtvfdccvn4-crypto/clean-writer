import type { Element, ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import type { DocumentCompileSettings } from '../settings';

/** Converts configured :::directives into semantic headings before document assembly. */
export const specialHeadingsPlugin: Plugin<[Pick<DocumentCompileSettings, 'specialHeadings'>], Root> = ({ specialHeadings: definitions }) => tree => {
  visit(tree, 'element', node => {
    const first = node.children[0];
    if (node.tagName !== 'p' || first?.type !== 'text') return;
    const text = first.value;
    if (text.trim() === ':::pagebreak') {
      replaceWithPageBreak(node);
      return;
    }
    const definition = definitions.find(item => text.startsWith(item.directive));
    if (!definition) return;
    first.value = text.slice(definition.directive.length).trimStart();
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
  visit(tree, 'text', (node, index, parent) => {
    if (index === undefined || !parent || node.value.trim() !== ':::pagebreak') return;
    if (parent.type === 'element' && (parent.tagName === 'code' || parent.tagName === 'pre')) return;

    const value = node.value;
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    const replacement: ElementContent[] = [
      ...(leading ? [{ type: 'text' as const, value: leading }] : []),
      createPageBreakNode(),
      ...(trailing ? [{ type: 'text' as const, value: trailing }] : [])
    ];
    parent.children.splice(index, 1, ...replacement);
  });
};

function replaceWithPageBreak(node: Element): void {
  node.tagName = 'div';
  node.children = [];
  node.properties = {
    ...(node.properties || {}),
    className: ['section-break'],
    dataExplicitPageBreak: 'true'
  };
}

function createPageBreakNode(): Element {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['section-break'], dataExplicitPageBreak: 'true' },
    children: []
  };
}
