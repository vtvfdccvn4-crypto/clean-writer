import { IsolatedPaginationHost } from '../../../src/pdf-preview/IsolatedPaginationHost';
import type { PdfPreviewJob } from '../../../src/pdf-preview/contracts';
import type { HeaderFooterRow, ProjectMetadata } from '../../../src/types';

const emptyMetadata: ProjectMetadata = {
  author: '', documentTitle: '', documentName: '', documentNumber: '', documentRevision: '',
  documentType: '', productName: '', productModule: '', productVersion: ''
};

const emptyCell = {
  content: '', fontFamily: 'serif', fontSize: 9, isBold: false, isItalic: false,
  horizontalAlign: 'left' as const, verticalAlign: 'middle' as const
};

export function createIsolatedJob(
  html: string,
  options: Partial<Pick<PdfPreviewJob, 'css' | 'margins' | 'marginImageSources'>> = {}
): PdfPreviewJob {
  const row = (content: string): HeaderFooterRow => ({
    centerWidth: '33%',
    left: { ...emptyCell, content },
    center: { ...emptyCell },
    right: { ...emptyCell }
  });
  return {
    html,
    css: options.css ?? '@page { size: A4; margin: 20mm; } body { font: 11pt serif; }',
    margins: options.margins ?? { header: row(''), footer: row(''), metadata: emptyMetadata },
    marginImageSources: options.marginImageSources ?? {}
  };
}

export async function paginateIsolated(
  html: string,
  options: Partial<Pick<PdfPreviewJob, 'css' | 'margins' | 'marginImageSources'>> = {},
  signal?: AbortSignal
) {
  return new IsolatedPaginationHost().requestPrintArtifact(createIsolatedJob(html, options), undefined, signal);
}

export function countIsolatedFrames(): number {
  return document.querySelectorAll('iframe[src*="pdf-preview"]').length;
}
