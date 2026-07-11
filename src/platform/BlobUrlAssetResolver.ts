import type { AssetResolver } from './types';
import { normalizeExplorerPath } from '../utils/path-utils';
import { getBlockGlyphLookupPaths } from '../customBlockGlyphs';

export class BlobUrlAssetResolver implements AssetResolver {
  private cache = new Map<string, string>();
  private blobGetter: (path: string) => Promise<Blob | null>;

  constructor(blobGetter: (path: string) => Promise<Blob | null>) {
    this.blobGetter = blobGetter;
  }

  async preloadImages(paths: string[]): Promise<void> {
    for (const path of paths) {
      const normalized = normalizeExplorerPath(path);
      if (!normalized || this.cache.has(normalized)) continue;
      let lastError: unknown = null;
      for (const candidate of getBlockGlyphLookupPaths(normalized)) {
        try {
          const blob = await this.blobGetter(candidate);
          if (blob) {
            this.cache.set(normalized, URL.createObjectURL(blob));
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }
      if (!this.cache.has(normalized) && lastError) {
        console.warn('Failed to preload image blob:', normalized, lastError);
      }
    }
  }

  resolveSync(path: string): string {
    const normalized = normalizeExplorerPath(path);
    return this.cache.get(normalized) || path;
  }

  release(url: string): void {
    for (const [key, value] of this.cache.entries()) {
      if (value === url) {
        URL.revokeObjectURL(url);
        this.cache.delete(key);
        break;
      }
    }
  }

  releaseAll(): void {
    for (const url of this.cache.values()) {
      URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}
