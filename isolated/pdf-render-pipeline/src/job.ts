import { PDF_PIPELINE_PROTOCOL_VERSION, type PdfRenderJob } from './contracts';

export interface CreatePdfRenderJobInput {
  readonly html: string;
  readonly css: string;
  readonly artifactCss?: string;
  /** Include serialized extension inputs that affect custom post-processors. */
  readonly extensionIdentity?: unknown;
}

/** Creates an immutable job with a compact, collision-resistant cache identity. */
export async function createPdfRenderJob(input: CreatePdfRenderJobInput): Promise<PdfRenderJob> {
  const html = requireNonEmpty(input.html, 'HTML');
  const css = requireNonEmpty(input.css, 'CSS');
  const artifactCss = input.artifactCss ?? '';
  const identity = stableStringify({
    protocolVersion: PDF_PIPELINE_PROTOCOL_VERSION,
    html,
    css,
    artifactCss,
    extensionIdentity: input.extensionIdentity ?? null
  });

  return Object.freeze({
    protocolVersion: PDF_PIPELINE_PROTOCOL_VERSION,
    renderId: await sha256(identity),
    html,
    css,
    artifactCss
  });
}

export function sameRenderJob(left: Pick<PdfRenderJob, 'renderId'>, right: Pick<PdfRenderJob, 'renderId'>): boolean {
  return left.renderId === right.renderId;
}

function requireNonEmpty(value: string, label: string): string {
  if (!value.trim()) throw new Error(`PDF render job requires non-empty ${label}.`);
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortValue(nested)])
  );
}

async function sha256(value: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('Web Crypto is required to create a PDF render identity.');
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
