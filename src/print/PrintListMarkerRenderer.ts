import type { ListStyle } from '../types';
import type { PrintLayoutSettings } from './PrintLayoutSettings';

/** Writes Markdown-parsed ordered-list values into the completed page tree. */
export function renderPrintListMarkers(root: ParentNode, layout: PrintLayoutSettings): void {
  root.querySelectorAll<HTMLElement>('ol[data-marker] > li > .document-list-marker[data-list-index]').forEach(marker => {
    const list = marker.closest<HTMLOListElement>('ol[data-marker]');
    const value = Number(marker.dataset.listIndex);
    if (!list || !Number.isSafeInteger(value) || value < 1) return;

    const parenthesized = list.dataset.marker === 'paren';
    const style = parenthesized ? layout.lists.olParen : layout.lists.ol;
    marker.textContent = `${formatListNumber(value, style)}${parenthesized ? ')' : '.'}`;
  });
}

function formatListNumber(value: number, style: ListStyle): string {
  switch (style.bulletIcon) {
    case 'lower-alpha': return toAlphabetic(value, false);
    case 'upper-alpha': return toAlphabetic(value, true);
    case 'lower-roman': return toRoman(value).toLowerCase();
    case 'upper-roman': return toRoman(value);
    default: return String(value);
  }
}

function toAlphabetic(value: number, uppercase: boolean): string {
  let remaining = value;
  let result = '';
  while (remaining > 0) {
    remaining--;
    result = String.fromCharCode(65 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return uppercase ? result : result.toLowerCase();
}

function toRoman(value: number): string {
  const symbols: readonly [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let remaining = value;
  let result = '';
  for (const [amount, token] of symbols) {
    while (remaining >= amount) {
      result += token;
      remaining -= amount;
    }
  }
  return result;
}
