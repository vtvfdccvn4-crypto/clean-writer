import type { ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import type { DocumentCompileSettings } from '../settings';
import { escapeRegExp } from '../../utils/regex';

export const customStylesPlugin: Plugin<[Pick<DocumentCompileSettings, 'customStyles'>], Root> = ({ customStyles }) => {
  return (tree: Root) => {
    if (customStyles.length === 0) return;

    const pairs = customStyles.map(s => ({
      ...s,
      regex: new RegExp(`(${escapeRegExp(s.openingPair)})(.*?)(${escapeRegExp(s.closingPair)})`, 'g')
    }));

    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined) return;
      
      const text = node.value;
      let matchFound = false;

      const newNodes: ElementContent[] = [];
      let currentIndex = 0;

      while (currentIndex < text.length) {
        let earliestMatch: RegExpExecArray | null = null;
        let matchedStyle = null;

        for (const style of pairs) {
          style.regex.lastIndex = currentIndex;
          const match = style.regex.exec(text);
          if (match && (!earliestMatch || match.index < earliestMatch.index)) {
            earliestMatch = match;
            matchedStyle = style;
          }
        }

        if (earliestMatch && matchedStyle) {
          matchFound = true;
          if (earliestMatch.index > currentIndex) {
            newNodes.push({
              type: 'text',
              value: text.slice(currentIndex, earliestMatch.index)
            });
          }

          const innerText = earliestMatch[2];
          const cssProps = [];
          if (matchedStyle.color) cssProps.push(`color: ${matchedStyle.color}`);
          if (matchedStyle.isBold) cssProps.push(`font-weight: bold`);
          if (matchedStyle.isItalic) cssProps.push(`font-style: italic`);

          newNodes.push({
            type: 'element',
            tagName: 'span',
            properties: {
              className: ['custom-style'],
              style: cssProps.join('; '),
              'data-custom-style-id': matchedStyle.id
            },
            children: [{ type: 'text', value: innerText }]
          });

          currentIndex = earliestMatch.index + earliestMatch[0].length;
        } else {
          newNodes.push({
            type: 'text',
            value: text.slice(currentIndex)
          });
          break;
        }
      }

      if (matchFound) {
        parent.children.splice(index, 1, ...newNodes);
        return index + newNodes.length;
      }
    });
  };
};
