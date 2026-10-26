import type { PrintPreviewFreshness } from '../preview/PreviewPolicy';

const MESSAGES: Record<PrintPreviewFreshness, { readonly text: string; readonly action: string }> = {
  'not-built': {
    text: 'Print preview is not built for this long document.',
    action: 'Build print preview'
  },
  'out-of-date': {
    text: 'Print preview is out of date.',
    action: 'Update print preview'
  }
};

/**
 * Shows whether the print preview matches the document. Null hides the notice.
 * The message is announced politely, so a screen reader hears it without focus moving.
 */
export function updatePreviewFreshness(freshness: PrintPreviewFreshness | null, onAction: () => void): void {
  const strip = document.getElementById('preview-freshness');
  const text = document.getElementById('preview-freshness-text');
  const action = document.getElementById('preview-freshness-action');
  if (!strip || !text || !(action instanceof HTMLButtonElement)) return;

  if (freshness === null) {
    strip.hidden = true;
    text.textContent = '';
    action.onclick = null;
    return;
  }
  const message = MESSAGES[freshness];
  strip.hidden = false;
  text.textContent = message.text;
  action.textContent = message.action;
  action.onclick = () => onAction();
}
