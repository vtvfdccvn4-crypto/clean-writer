export type FontAwesomeStyle = 'regular' | 'solid' | 'brands';

/** Renders a decorative Material Symbols glyph with the shared icon class. */
export function materialIcon(name: string): string {
  return `<span class="ui-icon material-symbols-outlined" aria-hidden="true">${name}</span>`;
}

/** Renders a decorative Font Awesome glyph with the shared icon class. */
export function fontAwesomeIcon(name: string, style: FontAwesomeStyle = 'regular'): string {
  return `<i class="ui-icon fa-${style} fa-${name}" aria-hidden="true"></i>`;
}
