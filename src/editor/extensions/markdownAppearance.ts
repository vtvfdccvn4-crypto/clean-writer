import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

import type { EditorSetup, TypographySetup } from '../../types';

/** Settings that affect Markdown tokens, never editor layout. */
export function markdownAppearanceExtension(setup: EditorSetup, typographySetup: TypographySetup): Extension {
  const headings = [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6];
  const headingColors = [
    typographySetup.h1.color,
    typographySetup.h2.color,
    typographySetup.h3.color,
    typographySetup.h4.color,
    typographySetup.h5.color,
    typographySetup.h6.color
  ];

  return syntaxHighlighting(HighlightStyle.define([
    ...headings.map((tag, index) => ({
      tag,
      fontWeight: setup.headingBold ? '700' : 'normal',
      color: headingColors[index]
    })),
    { tag: tags.strong, fontWeight: setup.strongBold ? '700' : 'normal' },
    { tag: tags.emphasis, fontStyle: setup.emphasisItalic ? 'italic' : 'normal' },
    { tag: [tags.link, tags.url], textDecoration: setup.linkUnderline ? 'underline' : 'none' }
  ]));
}
