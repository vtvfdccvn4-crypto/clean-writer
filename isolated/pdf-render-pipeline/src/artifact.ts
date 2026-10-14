import { PDF_ARTIFACT_SCHEMA_VERSION, type PdfArtifact } from './contracts';

/** Validates and deeply freezes an artifact at the frame/host ownership boundary. */
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

export function renderPdfArtifactContent(doc: Document, artifact: PdfArtifact): DocumentFragment {
  const template = doc.createElement('template');
  template.innerHTML = artifact.html;
  return template.content;
}

export function createPdfArtifactStyle(doc: Document, artifact: PdfArtifact): HTMLStyleElement {
  const style = doc.createElement('style');
  style.textContent = artifact.css;
  return style;
}
