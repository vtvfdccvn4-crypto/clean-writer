import type { Extension } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';

/** Markdown parsing and CodeMirror's built-in token colors. */
export function markdownLanguageExtension(): Extension {
  return [
    markdown(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true })
  ];
}
