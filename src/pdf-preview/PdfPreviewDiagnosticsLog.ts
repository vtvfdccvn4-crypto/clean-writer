import type { PdfPreviewPaginationDiagnostics, PdfPreviewPaginationOutcome } from './contracts';

const STORAGE_KEY = 'clear-writer.pdf-preview-diagnostics.v1';
const MAX_ENTRIES = 50;

type DiagnosticLogEntry = PdfPreviewPaginationDiagnostics & {
  recordedAt: string;
  status: PdfPreviewPaginationOutcome<unknown>['status'];
  message?: string;
};

/** Stores bounded, content-free PDF-preview diagnostics across browser sessions. */
export function recordPdfPreviewDiagnostic(
  outcome: PdfPreviewPaginationOutcome<unknown>
): void {
  const entry: DiagnosticLogEntry = {
    ...outcome.diagnostics,
    recordedAt: new Date().toISOString(),
    status: outcome.status,
    ...('message' in outcome ? { message: outcome.message } : {})
  };
  console.info('[PDF preview diagnostics]', entry);
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    const entries = Array.isArray(existing) ? existing : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, entry].slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics must never prevent a preview from printing.
  }
}
