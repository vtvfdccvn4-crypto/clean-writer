/** Stable documents for visually checking CodeMirror extension bundles. */
export const rawTextControlDocument = `
Plain text control

This document deliberately contains no Markdown syntax or embedded content.

The next line is long enough to reveal wrapping, horizontal scrolling, and line-height regressions without adding another rendering concern:
The editor should keep this sentence as literal text while preserving ordinary spaces, punctuation, and the caret position when it is edited.

Final paragraph after a single blank line.
`.trim();

const inlineImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="20"%3E%3Crect width="32" height="20" fill="%23008a9a"/%3E%3C/svg%3E';
const blockImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="220"%3E%3Crect width="640" height="220" fill="%23d9eef0"/%3E%3Ctext x="32" y="120" font-size="32"%3EBlock image%3C/text%3E%3C/svg%3E';

export const markdownStyleSmokeDocument = `
# Editor Style Smoke

This paragraph contains **strong text**, *emphasis*, a [link](https://example.com), and an inline image ![inline sample](${inlineImage}) before continuing on the same line.

## Wrapping And Lists

This deliberately long paragraph verifies that source text, decorations, and widgets do not create blank vertical space when the editor wraps a line at a narrow width.

- First list item
- Second list item with \`inline code\`

1. First ordered item
2. Second ordered item

![Block sample](${blockImage})

Text immediately after the block image must begin on the next source line without an unexpected gap.

\`\`\`
const literal = 'code block';
\`\`\`
`.trim();

export const editorStyleSmokeDocuments = {
  rawTextControlDocument,
  markdownStyleSmokeDocument
} as const;
