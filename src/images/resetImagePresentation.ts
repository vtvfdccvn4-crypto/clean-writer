import type { ImageSetup } from '../types';
import { parseMarkdownImages } from './markdownImages';

/**
 * Replaces the project-controlled presentation attributes on every Markdown
 * image while keeping its Markdown syntax, width, and any custom attributes.
 */
export function resetImagePresentation(markdown: string, setup: ImageSetup): string {
  const margin = setup.marginTop === setup.marginBottom
    ? `${setup.marginTop}mm 0`
    : `${setup.marginTop}mm 0 ${setup.marginBottom}mm`;
  const images = parseMarkdownImages(markdown);
  let result = markdown;

  // Work backwards so parser offsets remain valid as attribute blocks change.
  for (const image of [...images].reverse()) {
    const existing = result.slice(image.end).match(/^(\{[^\r\n}]*\})/)?.[1] ?? '';
    const attributes = replaceAttribute(
      replaceAttribute(existing, 'align', setup.alignment),
      'margin', `"${margin}"`
    );
    const end = image.end + existing.length;
    result = `${result.slice(0, image.end)}${attributes}${result.slice(end)}`;
  }
  return result;
}

function replaceAttribute(attributes: string, key: 'align' | 'margin', value: string): string {
  const content = attributes.startsWith('{') && attributes.endsWith('}')
    ? attributes.slice(1, -1).trim()
    : '';
  const without = content
    .replace(new RegExp(`(?:^|\\s+)${key}=(?:"[^"]*"|'[^']*'|[^\\s}]*)`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `{${[without, `${key}=${value}`].filter(Boolean).join(' ').trim()}}`;
}
