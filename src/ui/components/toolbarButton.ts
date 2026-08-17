export type ToolbarButtonVariant = 'icon' | 'text' | 'icon-text';

export interface ToolbarButtonOptions {
  id?: string;
  variant: ToolbarButtonVariant;
  title: string;
  ariaLabel?: string;
  icon?: string;
  content?: string;
  classes?: string[];
  attributes?: Record<string, string>;
}

/** Builds toolbar buttons with one visual contract; state classes stay local. */
export function toolbarButton(options: ToolbarButtonOptions): string {
  const classes = ['ui-button', `ui-button--${options.variant}`, ...(options.classes ?? [])];
  const attributes = [
    `class="${classes.join(' ')}"`,
    'type="button"',
    options.id ? `id="${escapeAttribute(options.id)}"` : '',
    `title="${escapeAttribute(options.title)}"`,
    options.ariaLabel ? `aria-label="${escapeAttribute(options.ariaLabel)}"` : '',
    ...Object.entries(options.attributes ?? {}).map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
  ].filter(Boolean).join(' ');
  return `<button ${attributes}>${options.icon ?? ''}${options.content ?? ''}</button>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
