import type { AssetResolver } from './types';
import { normalizeExplorerPath } from '../utils/path-utils';
import { getBlockGlyphLookupPaths } from '../customBlockGlyphs';

export class BlobUrlAssetResolver implements AssetResolver {
  private cache = new Map<string, string>();
  private inFlight = new Map<string, Promise<void>>();
  private cacheGeneration = 0;
  private blobGetter: (path: string) => Promise<Blob | null>;

  constructor(blobGetter: (path: string) => Promise<Blob | null>) {
    this.blobGetter = blobGetter;
  }

  async preloadImages(paths: string[], signal?: AbortSignal): Promise<void> {
    const uniquePaths = [...new Set(paths.map(path => normalizeExplorerPath(path)).filter(Boolean))];
    let nextIndex = 0;
    const preloadNext = async () => {
      while (true) {
        throwIfAborted(signal);
        const normalized = uniquePaths[nextIndex++];
        if (!normalized) return;
        await this.preloadImage(normalized);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, uniquePaths.length) }, preloadNext));
  }

  private preloadImage(normalized: string): Promise<void> {
    if (this.cache.has(normalized)) return Promise.resolve();
    const existing = this.inFlight.get(normalized);
    if (existing) return existing;

    const generation = this.cacheGeneration;
    const request = (async () => {
      let lastError: unknown = null;
      for (const candidate of getBlockGlyphLookupPaths(normalized)) {
        try {
          const blob = await this.blobGetter(candidate);
          if (blob && generation === this.cacheGeneration) {
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
    })();
    this.inFlight.set(normalized, request);
    return request.finally(() => {
      if (this.inFlight.get(normalized) === request) this.inFlight.delete(normalized);
    });
  }

  resolveSync(path: string): string {
    const normalized = normalizeExplorerPath(path);
    return this.cache.get(normalized) || path;
  }

  releaseAll(): void {
    this.cacheGeneration += 1;
    for (const url of this.cache.values()) {
      URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Asset preloading was cancelled.', 'AbortError');
}
