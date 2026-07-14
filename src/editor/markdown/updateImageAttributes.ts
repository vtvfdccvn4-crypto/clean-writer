import type { EditorMarkdownImage } from './parseMarkdownImage';

export interface ImageAttributes {
  align?: 'left' | 'center' | 'right';
  width?: string;
}

function getAttributes(value: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const source = value.replace(/^\{|\}$/g, '');
  const matcher = /([a-zA-Z][\w-]*)(?:=(?:"([^"]*)"|([^\s}]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(source))) attributes.set(match[1], match[2] ?? match[3] ?? '');
  return attributes;
}

/** Rebuild an image's optional attributes without touching its Markdown URL or alt text. */
export function updateImageAttributes(image: EditorMarkdownImage, updates: ImageAttributes): string {
  const attributes = getAttributes(image.attributes);
  if (updates.width !== undefined) attributes.set('width', updates.width);
  if (updates.align !== undefined) attributes.set('align', updates.align);

  const text = [...attributes].map(([key, value]) => {
    if (!value) return key;
    return `${key}=${/\s/.test(value) ? `"${value}"` : value}`;
  }).join(' ');
  return text ? `{${text}}` : '';
}
