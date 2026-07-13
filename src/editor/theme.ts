import { EditorView } from 'codemirror';

export const customTheme = EditorView.theme({
  "&": {
    color: "var(--text-main)",
    backgroundColor: "transparent"
  },
  ".cm-content": {
    caretColor: "var(--text-main)"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--accent-color)"
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-glow)"
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    border: "none"
  },
  ".cm-scroller": {
    fontFamily: 'var(--font-mono)',
    lineHeight: "1.6",
    letterSpacing: "normal"
  }
}, { dark: false });
