import type { PdfArtifact } from './PdfArtifact';

/** The sole boundary that turns immutable artifact strings back into DOM. */
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
