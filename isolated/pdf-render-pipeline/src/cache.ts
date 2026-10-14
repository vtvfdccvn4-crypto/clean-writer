import type { PdfArtifact } from './contracts';

/** Small render-id keyed LRU cache. It never stores source jobs or app state. */
export class PdfArtifactCache {
  readonly #artifacts = new Map<string, PdfArtifact>();
  readonly #maximumEntries: number;

  constructor(maximumEntries = 3) {
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1) {
      throw new Error('PDF artifact cache size must be a positive integer.');
    }
    this.#maximumEntries = maximumEntries;
  }

  get(renderId: string): PdfArtifact | undefined {
    const artifact = this.#artifacts.get(renderId);
    if (!artifact) return undefined;
    this.#artifacts.delete(renderId);
    this.#artifacts.set(renderId, artifact);
    return artifact;
  }

  set(artifact: PdfArtifact): void {
    this.#artifacts.delete(artifact.renderId);
    this.#artifacts.set(artifact.renderId, artifact);
    while (this.#artifacts.size > this.#maximumEntries) {
      const oldest = this.#artifacts.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#artifacts.delete(oldest);
    }
  }

  clear(): void {
    this.#artifacts.clear();
  }
}
