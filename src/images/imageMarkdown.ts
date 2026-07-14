import { getBaseName, normalizeExplorerPath } from '../utils/path-utils';

export function normalizeProjectImagePath(path: string): string {
  const normalized = normalizeExplorerPath(path);
  if (!normalized) return normalized;
  return normalized.startsWith('images/') ? normalized : `images/${normalized}`;
}

/** Create the portable Markdown representation used by all editor image entry points. */
export function buildProjectImageMarkdown(path: string): string {
  const assetPath = normalizeProjectImagePath(path);
  const basename = getBaseName(assetPath);
  const altText = basename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  return `![${altText}](<${assetPath}>){width=100% align=center margin="6mm 0"}`;
}
