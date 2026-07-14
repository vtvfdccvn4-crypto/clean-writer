import { getBaseName, normalizeExplorerPath } from '../utils/path-utils';

const extensionByMimeType: Record<string, string> = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp'
};

function sectionImagePrefix(sectionPath: string): string {
  const sectionName = getBaseName(sectionPath).replace(/\.[^.]+$/, '');
  return sectionName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'image';
}

export function pastedImageExtension(file: File): string {
  const extension = file.name.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
  return extension ?? extensionByMimeType[file.type] ?? '.png';
}

/** Choose the next section-scoped image name, such as `instrument_design-3.png`. */
export function nextPastedImageFilename(sectionPath: string, existingPaths: string[], extension: string): string {
  const prefix = sectionImagePrefix(sectionPath);
  const matcher = new RegExp(`^images/${prefix}-(\\d+)${extension.replace('.', '\\.')}$`, 'i');
  const highestNumber = existingPaths.reduce((highest, path) => {
    const match = normalizeExplorerPath(path).match(matcher);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}-${highestNumber + 1}${extension}`;
}
