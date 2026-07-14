import { EditorView } from '@codemirror/view';

export const imageTheme = EditorView.baseTheme({
  '.cm-markdown-image': {
    display: 'block',
    lineHeight: '0',
    marginBlock: '0',
    maxWidth: '100%',
    position: 'relative',
    width: '100%'
  },
  '.cm-markdown-image img': {
    display: 'block',
    marginBlock: '0',
    marginInline: 'auto',
    maxWidth: 'min(100%, var(--document-content-width, 100%))',
    minHeight: '32px',
    objectFit: 'contain'
  },
  '.cm-markdown-image.is-broken img': { outline: '2px dashed #c2410c' },
  '.cm-markdown-image-menu': {
    background: 'var(--surface, white)',
    border: '1px solid var(--border, #cbd5e1)',
    boxShadow: '0 4px 12px rgb(15 23 42 / 18%)',
    display: 'flex',
    gap: '2px',
    padding: '4px',
    position: 'absolute',
    right: '0',
    top: '0',
    zIndex: '2'
  },
  '.cm-markdown-image-menu button': { font: 'inherit' },
  '.cm-markdown-image-resize-handle': {
    background: 'var(--accent, #2563eb)',
    border: '1px solid white',
    bottom: '-5px',
    cursor: 'nwse-resize',
    height: '10px',
    position: 'absolute',
    right: '-5px',
    width: '10px'
  }
});
