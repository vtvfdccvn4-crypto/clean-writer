import { getBaseName, normalizeExplorerPath } from '../utils/path-utils';
import { DEFAULT_IMAGE_SETUP } from '../config/defaults';
import type { ImageSetup } from '../types';

export function normalizeProjectImagePath(path: string): string {
  const normalized = normalizeExplorerPath(path);
  if (!normalized) return normalized;
  return normalized.startsWith('images/') ? normalized : `images/${normalized}`;
}

/** Create the portable Markdown representation used by all editor image entry points. */
export function buildProjectImageMarkdown(path: string, setup: ImageSetup = DEFAULT_IMAGE_SETUP): string {
  const assetPath = normalizeProjectImagePath(path);
  const basename = getBaseName(assetPath);
  const altText = basename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  const margin = setup.marginTop === setup.marginBottom
    ? `${setup.marginTop}mm 0`
    : `${setup.marginTop}mm 0 ${setup.marginBottom}mm`;
  return `![${altText}](<${assetPath}>){width=100% align=${setup.alignment} margin="${margin}"}`;
}
