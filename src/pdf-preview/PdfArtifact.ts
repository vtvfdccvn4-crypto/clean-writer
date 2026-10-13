import type { PdfArtifactKey } from './PdfRenderSnapshot';

/** The completed, self-contained rendering product shared by preview and print. */
export const PDF_ARTIFACT_SCHEMA_VERSION = 1;

export interface PdfArtifactPage {
  readonly number: number;
  readonly anchor?: string;
}

export interface PdfArtifact {
  readonly schemaVersion: typeof PDF_ARTIFACT_SCHEMA_VERSION;
  readonly artifactId: string;
  /** Complete immutable render-snapshot identity. */
  readonly key: PdfArtifactKey;
  readonly html: string;
  readonly css: string;
  readonly pageCount: number;
  readonly pages: readonly PdfArtifactPage[];
}

export function createPdfArtifact(input: PdfArtifact): PdfArtifact {
  if (input.schemaVersion !== PDF_ARTIFACT_SCHEMA_VERSION) throw new Error('Unsupported PDF artifact schema.');
  if (!input.artifactId) throw new Error('PDF artifact is missing its identity.');
  if (!input.key) throw new Error('PDF artifact is missing its render identity.');
  if (!input.key.compilerVersion || !input.key.document || !input.key.stylesheet || !input.key.margins || !input.key.assets) {
    throw new Error('PDF artifact has an incomplete render identity.');
  }
  if (!input.html.trim()) throw new Error('PDF artifact is missing page HTML.');
  if (!input.css.trim()) throw new Error('PDF artifact is missing its stylesheet.');
  if (!Number.isSafeInteger(input.pageCount) || input.pageCount < 1) throw new Error('PDF artifact has an invalid page count.');
  if (input.pages.length !== input.pageCount) throw new Error('PDF artifact page metadata does not match its page count.');

  return Object.freeze({
    schemaVersion: PDF_ARTIFACT_SCHEMA_VERSION,
    artifactId: input.artifactId,
    key: Object.freeze({ ...input.key }),
    html: input.html,
    css: input.css,
    pageCount: input.pageCount,
    pages: Object.freeze(input.pages.map(page => Object.freeze({ ...page })))
  });
}
