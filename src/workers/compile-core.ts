import { compilePreviewDocument, type CompiledPreview } from '../compiler';
import type { AssetResolver } from '../platform/types';
import type { CompileJob, CompilePhaseTimings } from './compile-protocol';

/**
 * The compile path that runs in the worker. It must not touch the DOM, window,
 * or application state; the production worker build checks that its bundle has
 * no DOM-only dependency. Tests run the same code in Node.
 */

export interface CompileOutcome {
  readonly compiled: CompiledPreview;
  readonly cacheHit: boolean;
  readonly phases: CompilePhaseTimings;
}

/** Resolves image sources from the map the page built. Unknown sources pass through unchanged. */
export function createSnapshotAssetResolver(assets: Readonly<Record<string, string>>): AssetResolver {
  return {
    async preloadImages() {
      // Assets were preloaded on the page before the job was posted.
    },
    resolveSync(path: string) {
      return Object.prototype.hasOwnProperty.call(assets, path) ? assets[path]! : path;
    },
    releaseAll() {
      // Nothing to release: the map is owned by the job.
    }
  };
}

const MAX_CACHE_ENTRIES = 48;
const MAX_CACHE_CHARACTERS = 64 * 1024 * 1024 / 2;

/** Compiled results keyed by content and settings, evicted least recently used first. */
export class CompileResultCache {
  private readonly entries = new Map<string, CompiledPreview>();
  private characters = 0;

  get(key: string): CompiledPreview | undefined {
    const value = this.entries.get(key);
    if (value) {
      // Re-insert so the entry becomes the most recently used.
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: CompiledPreview): void {
    const previous = this.entries.get(key);
    if (previous) this.characters -= previous.html.length;
    this.entries.delete(key);
    this.entries.set(key, value);
    this.characters += value.html.length;
    while (this.entries.size > MAX_CACHE_ENTRIES || this.characters > MAX_CACHE_CHARACTERS) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.characters -= this.entries.get(oldest)?.html.length ?? 0;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Everything that changes the output: the text, the settings, the assets, and the line offsets. */
export async function compileCacheKey(job: CompileJob): Promise<string> {
  const parts = await Promise.all([
    hashText(job.markdown),
    hashText(JSON.stringify(job.settings)),
    hashText(JSON.stringify(job.assets)),
    hashText(JSON.stringify([job.sourceLineOffset, job.sourceSegments ?? null]))
  ]);
  return parts.join(':');
}

export async function compileJob(job: CompileJob, cache: CompileResultCache): Promise<CompileOutcome> {
  if (typeof job.markdown !== 'string') {
    throw new TypeError('The compile job must carry Markdown text.');
  }
  const key = await compileCacheKey(job);
  const cached = cache.get(key);
  if (cached) return { compiled: cached, cacheHit: true, phases: {} };

  const phases: CompilePhaseTimings = {};
  const compiled = await compilePreviewDocument(
    job.markdown,
    createSnapshotAssetResolver(job.assets),
    job.settings,
    {
      sourceLineOffset: job.sourceLineOffset,
      sourceSegments: job.sourceSegments,
      onPhase: (phase, durationMs) => {
        phases[phase] = durationMs;
      }
    }
  );
  cache.set(key, compiled);
  return { compiled, cacheHit: false, phases };
}
