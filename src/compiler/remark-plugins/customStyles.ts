import type { Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { state } from '../../state';
import { escapeRegExp } from '../../utils/regex';

export const customStylesPlugin: Plugin<[], Root> = () => {
  return (tree: Root) => {
    const customStyles = state.get.customStyles || [];
    if (customStyles.length === 0) return;

    const pairs = customStyles.map(s => ({
      ...s,
      regex: new RegExp(`(${escapeRegExp(s.openingPair)})(.*?)(${escapeRegExp(s.closingPair)})`, 'g')
    }));

    visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
      if (!parent || index === undefined) return;
      
      let text = node.value as string;
      let matchFound = false;

      const newNodes: any[] = [];
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
          if (matchedStyle.fontFamily) cssProps.push(`font-family: ${matchedStyle.fontFamily}`);
          if (matchedStyle.fontSize) cssProps.push(`font-size: ${matchedStyle.fontSize}pt`);
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
