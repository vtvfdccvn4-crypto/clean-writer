import { normalizeExplorerPath } from '../utils/path-utils';
import type { AssetResolver } from '../platform/types';

export const IMAGE_FALLBACK_SRC = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100'><rect width='200' height='100' fill='%23fce4e4' stroke='%23f87171' stroke-width='2' stroke-dasharray='4'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23ef4444'>Image Not Found</text></svg>";

const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;

function addCandidate(candidates: string[], path: string): void {
  const normalized = normalizeExplorerPath(path);
  if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
}

export function getProjectImageLookupPaths(source: string): string[] {
  const trimmed = source.trim();
  if (!trimmed || URI_SCHEME.test(trimmed) || trimmed.startsWith('//')) return [];
  const normalized = normalizeExplorerPath(trimmed);
  if (!normalized) return [];

  const candidates: string[] = [];
  addCandidate(candidates, normalized);

  const lower = normalized.toLowerCase();
  if (lower.startsWith('assets/images/')) {
    addCandidate(candidates, `images/${normalized.slice('assets/images/'.length)}`);
  }
  if (lower.startsWith('images/images/')) {
    addCandidate(candidates, `images/${normalized.slice('images/images/'.length)}`);
  }

  return candidates;
}

/** Resolve a Markdown image target without treating file-name # or ? characters as URL syntax. */
export function resolveImageSource(source: string, assetResolver?: AssetResolver | null): string {
  const trimmed = source.trim();
  if (!trimmed || URI_SCHEME.test(trimmed) || trimmed.startsWith('//')) return trimmed;

  if (assetResolver && typeof assetResolver === 'object' && 'resolveSync' in assetResolver) {
    return assetResolver.resolveSync(trimmed);
  }

  return trimmed.replace(/\\/g, '/');
}

export function applyImageFallback(img: HTMLImageElement, originalSource: string): void {
  img.onerror = null;
  img.src = IMAGE_FALLBACK_SRC;
  img.title = `Broken Image Reference: ${originalSource}`;
}

export function bindImageFallbacks(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>('img[data-image-source]').forEach(img => {
    const source = img.dataset.imageSource || img.getAttribute('src') || '';
    img.onerror = () => applyImageFallback(img, source);
  });
}
