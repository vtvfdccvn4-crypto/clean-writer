import {
  PDF_ARTIFACT_SCHEMA_VERSION,
  PDF_PREVIEW_PROTOCOL_VERSION,
  type PaginationBudget,
  type PdfArtifact,
  type PdfRenderJob
} from './contracts';

export interface CreatePdfRenderJobInput {
  readonly html: string;
  readonly css: string;
  readonly artifactCss?: string;
  /** Serializable values used by renderer extensions and cache invalidation. */
  readonly extensionIdentity?: unknown;
}

export interface PaginationBudgetOptions {
  readonly minimumTimeoutMs?: number;
  readonly maximumTimeoutMs?: number;
  readonly baseTimeoutMs?: number;
  readonly timeoutPerPageMs?: number;
  readonly timeoutPerImageMs?: number;
  readonly charactersPerPage?: number;
}

export async function createPdfRenderJob(input: CreatePdfRenderJobInput): Promise<PdfRenderJob> {
  const html = requireText(input.html, 'HTML');
  const css = requireText(input.css, 'CSS');
  const artifactCss = input.artifactCss ?? '';
  const extensionIdentity = canonicalJson(input.extensionIdentity ?? null);
  const framedIdentity = [
    String(PDF_PREVIEW_PROTOCOL_VERSION),
    String(html.length), html,
    String(css.length), css,
    String(artifactCss.length), artifactCss,
    String(extensionIdentity.length), extensionIdentity
  ].join('\u001f');

  return Object.freeze({
    protocolVersion: PDF_PREVIEW_PROTOCOL_VERSION,
    renderId: await sha256(framedIdentity),
    html,
    css,
    artifactCss
  });
}

export function createPdfArtifact(input: PdfArtifact): PdfArtifact {
  if (input.schemaVersion !== PDF_ARTIFACT_SCHEMA_VERSION) throw new Error('Unsupported PDF artifact schema.');
  if (!input.artifactId.trim()) throw new Error('PDF artifact is missing its identity.');
  if (!/^[a-f0-9]{64}$/i.test(input.renderId)) throw new Error('PDF artifact has an invalid render identity.');
  if (!input.html.trim()) throw new Error('PDF artifact is missing page HTML.');
  if (!input.css.trim()) throw new Error('PDF artifact is missing its stylesheet.');
  if (!Number.isSafeInteger(input.pageCount) || input.pageCount < 1) throw new Error('PDF artifact has an invalid page count.');
  if (input.pages.length !== input.pageCount) throw new Error('PDF artifact page metadata does not match its page count.');
  input.pages.forEach((page, index) => {
    if (page.number !== index + 1) throw new Error('PDF artifact page numbers must be contiguous and one-based.');
    if (page.anchor !== undefined && !page.anchor.trim()) throw new Error('PDF artifact page anchors cannot be empty.');
  });

  return Object.freeze({
    schemaVersion: PDF_ARTIFACT_SCHEMA_VERSION,
    artifactId: input.artifactId,
    renderId: input.renderId,
    html: input.html,
    css: input.css,
    pageCount: input.pageCount,
    pages: Object.freeze(input.pages.map(page => Object.freeze({ ...page })))
  });
}

export function estimatePaginationBudget(
  input: Pick<PdfRenderJob, 'html'>,
  options: PaginationBudgetOptions = {}
): PaginationBudget {
  const minimum = positive(options.minimumTimeoutMs ?? 30_000, 'minimum timeout');
  const maximum = positive(options.maximumTimeoutMs ?? 300_000, 'maximum timeout');
  if (maximum < minimum) throw new Error('Maximum timeout must not be smaller than minimum timeout.');
  const charactersPerPage = positive(options.charactersPerPage ?? 1_200, 'characters per page');
  const textCharacters = input.html
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:[a-z][a-z0-9]+|#[0-9]+|#x[a-f0-9]+);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
  const imageCount = (input.html.match(/<img\b/gi) ?? []).length;
  const explicitBreaks = (input.html.match(/(?:break-before\s*:\s*page|page-break-before\s*:\s*always|data-page-break)/gi) ?? []).length;
  const estimatedPages = Math.max(1, explicitBreaks + 1, Math.ceil(textCharacters / charactersPerPage) + Math.ceil(imageCount * 0.75));
  const timeout = positive(options.baseTimeoutMs ?? 15_000, 'base timeout')
    + estimatedPages * positive(options.timeoutPerPageMs ?? 650, 'page timeout')
    + imageCount * positive(options.timeoutPerImageMs ?? 1_000, 'image timeout');
  return Object.freeze({
    estimatedPages,
    imageCount,
    textCharacters,
    timeoutMs: Math.min(maximum, Math.max(minimum, timeout))
  });
}

/** Small render-id keyed LRU cache. It retains completed artifacts, never source jobs. */
export class PdfArtifactCache {
  readonly #entries = new Map<string, PdfArtifact>();
  readonly #capacity: number;

  constructor(capacity = 3) {
    this.#capacity = positiveInteger(capacity, 'PDF artifact cache capacity');
  }

  get(renderId: string): PdfArtifact | undefined {
    const artifact = this.#entries.get(renderId);
    if (!artifact) return undefined;
    this.#entries.delete(renderId);
    this.#entries.set(renderId, artifact);
    return artifact;
  }

  set(artifact: PdfArtifact): void {
    this.#entries.delete(artifact.renderId);
    this.#entries.set(artifact.renderId, artifact);
    while (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}

function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  const normalize = (entry: unknown): unknown => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return entry;
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) throw new Error('Render identity numbers must be finite.');
      return entry;
    }
    if (Array.isArray(entry)) {
      if (active.has(entry)) throw new Error('Render identity must not contain cycles.');
      active.add(entry);
      const result = entry.map(normalize);
      active.delete(entry);
      return result;
    }
    if (typeof entry === 'object') {
      if (active.has(entry)) throw new Error('Render identity must not contain cycles.');
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== Object.prototype && prototype !== null) throw new Error('Render identity must contain only plain objects and arrays.');
      active.add(entry);
      const result = Object.fromEntries(Object.entries(entry as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]));
      active.delete(entry);
      return result;
    }
    throw new Error(`Unsupported render identity value: ${typeof entry}.`);
  };
  return JSON.stringify(normalize(value));
}

function requireText(value: string, label: string): string {
  if (!value.trim()) throw new Error(`PDF render job requires non-empty ${label}.`);
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is required to create a PDF render identity.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
