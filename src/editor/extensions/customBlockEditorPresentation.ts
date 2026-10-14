import type { CustomBlockStyle } from '../../types';

export const CUSTOM_BLOCK_EDITOR_LINE_CLASS = 'cm-custom-block-line';
export const CUSTOM_BLOCK_SPACE_BEFORE_PROPERTY = '--cw-custom-block-space-before';

/**
 * CodeMirror owns the editor's vertical geometry. Document margins cannot be
 * copied onto a `.cm-line`: CSS margins are outside getBoundingClientRect(),
 * so CodeMirror's height map would no longer match the rendered DOM.
 *
 * The editor represents only the quote's leading spacing as line padding.
 * Bottom spacing is intentionally omitted from CodeMirror. Preview and print
 * renderers continue to use both of the style's semantic margins.
 */
export function customBlockEditorLineAttributes(style: CustomBlockStyle): { class: string; style: string } {
  return {
    class: CUSTOM_BLOCK_EDITOR_LINE_CLASS,
    style: styleText([
      // Font size is an editor preference. Keep the document style's font size
      // for preview/print, but let CodeMirror inherit --editor-font-size.
      style.color ? `color: ${style.color}` : undefined,
      style.isBold ? 'font-weight: bold' : undefined,
      style.isItalic ? 'font-style: italic' : undefined,
      style.lineHeight ? `line-height: ${boundedNumber(style.lineHeight, 0.5, 5)}` : undefined,
      `${CUSTOM_BLOCK_SPACE_BEFORE_PROPERTY}: ${boundedNumber(style.marginTop, 0, 500)}pt`
    ])
  };
}

function styleText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('; ');
}

function boundedNumber(value: unknown, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}
