import type { PdfPreviewProgress, PdfPreviewProgressPhase } from '../pdf-preview/contracts';

/**
 * Progress, cancellation and announcements for the PDF preview job. The visible
 * strip updates on every progress report. Screen readers hear only milestones,
 * so a long job does not produce a stream of announcements.
 */

/** Announce pagination every this many pages. */
export const PDF_JOB_ANNOUNCE_EVERY_PAGES = 25;

const PHASE_LABELS: Record<PdfPreviewProgressPhase, string> = {
  'open-print-target': 'Opening print window',
  'load-pagination-frame': 'Loading layout engine',
  paginate: 'Paginating',
  'transfer-print-artifact': 'Preparing print document',
  'install-print-document': 'Preparing print document',
  print: 'Print dialog open'
};

export interface PdfJobDescription {
  readonly label: string;
  /** Undefined when the job has no page count to measure against yet. */
  readonly value?: number;
  readonly max?: number;
}

/**
 * Turns one progress report into what the strip shows. The page estimate is a
 * heuristic, so the bar's maximum grows when the job passes it.
 */
export function describePdfJobProgress(progress: PdfPreviewProgress): PdfJobDescription {
  const base = PHASE_LABELS[progress.phase];
  if (progress.pagesCompleted === undefined) return { label: `${base}…` };
  const pages = progress.pagesCompleted;
  const estimate = progress.estimatedPages;
  const elapsed = progress.elapsedMs === undefined ? '' : ` · ${Math.ceil(progress.elapsedMs / 1000)} s`;
  const of = estimate ? ` of about ${estimate}` : '';
  return {
    label: `${base}: page ${pages}${of}${elapsed}`,
    value: pages,
    max: estimate ? Math.max(estimate, pages) : undefined
  };
}

/** The page milestone to announce, if this report crosses one since the last announcement. */
export function paginationMilestone(previousAnnouncedPages: number, pages: number): number | null {
  const crossed = Math.floor(pages / PDF_JOB_ANNOUNCE_EVERY_PAGES) > Math.floor(previousAnnouncedPages / PDF_JOB_ANNOUNCE_EVERY_PAGES);
  return crossed ? Math.floor(pages / PDF_JOB_ANNOUNCE_EVERY_PAGES) * PDF_JOB_ANNOUNCE_EVERY_PAGES : null;
}

export type PdfJobOutcome =
  | { readonly kind: 'printing' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'failed'; readonly message: string };

export function describePdfJobOutcome(outcome: PdfJobOutcome): { announcement: string; keepVisible: false } {
  switch (outcome.kind) {
    case 'printing': return { announcement: 'PDF preview ready. The print dialog is open.', keepVisible: false };
    case 'cancelled': return { announcement: 'PDF preview cancelled.', keepVisible: false };
    case 'blocked': return { announcement: 'PDF preview was blocked. Allow pop-ups for this site and try again.', keepVisible: false };
    case 'failed': return { announcement: `PDF preview failed: ${outcome.message}`, keepVisible: false };
  }
}

export interface PdfJobStatus {
  start(): void;
  update(progress: PdfPreviewProgress): void;
  complete(outcome: PdfJobOutcome): void;
}

/** The markup the preview footer renders. Live announcements sit outside the hidden strip. */
export const pdfJobStatusTemplate = (): string => `
  <p id="pdf-job-announcer" class="visually-hidden" role="status" aria-live="polite"></p>
  <section id="pdf-job-status" class="pdf-job-status" aria-label="PDF preview progress" hidden>
    <p id="pdf-job-label" class="pdf-job-label"></p>
    <progress id="pdf-job-progress" class="pdf-job-progress" aria-label="PDF preview progress"></progress>
    <button id="btn-pdf-job-cancel" class="ui-button" type="button">Cancel</button>
  </section>
`;

/** Binds the strip to the DOM. Missing elements make every call a no-op, so the export still runs. */
export function createPdfJobStatus(onCancel: () => void): PdfJobStatus {
  const strip = document.getElementById('pdf-job-status');
  const label = document.getElementById('pdf-job-label');
  const bar = document.getElementById('pdf-job-progress');
  const cancelButton = document.getElementById('btn-pdf-job-cancel');
  const announcer = document.getElementById('pdf-job-announcer');
  let announcedPages = 0;
  let announcedPhase: PdfPreviewProgressPhase | null = null;

  const announce = (text: string) => {
    if (announcer) announcer.textContent = text;
  };
  // Assigned, not added: every export binds this button again, and one click
  // must not reach the cancel handlers of earlier exports.
  if (cancelButton) {
    cancelButton.onclick = () => {
      if (cancelButton instanceof HTMLButtonElement) cancelButton.disabled = true;
      if (label) label.textContent = 'Cancelling PDF preview…';
      onCancel();
    };
  }

  return {
    start() {
      announcedPages = 0;
      announcedPhase = null;
      if (strip) strip.hidden = false;
      if (label) label.textContent = 'Preparing PDF preview. Press Escape or Cancel to stop.';
      if (bar instanceof HTMLProgressElement) bar.removeAttribute('value');
      if (cancelButton instanceof HTMLButtonElement) cancelButton.disabled = false;
      announce('PDF preview started.');
    },
    update(progress) {
      const description = describePdfJobProgress(progress);
      if (label) label.textContent = description.label;
      if (bar instanceof HTMLProgressElement) {
        if (description.value === undefined) {
          bar.removeAttribute('value');
        } else {
          bar.max = description.max ?? 100;
          bar.value = description.value;
        }
      }
      if (progress.pagesCompleted !== undefined) {
        const milestone = paginationMilestone(announcedPages, progress.pagesCompleted);
        if (milestone !== null) {
          announcedPages = progress.pagesCompleted;
          announce(`Page ${milestone}${progress.estimatedPages ? ` of about ${progress.estimatedPages}` : ''}.`);
        }
      }
      if (progress.phase !== announcedPhase && progress.phase === 'print') {
        announcedPhase = progress.phase;
        announce('Print dialog open.');
      }
    },
    complete(outcome) {
      if (strip) strip.hidden = true;
      announce(describePdfJobOutcome(outcome).announcement);
    }
  };
}
