import { createPdfJobStatus, pdfJobStatusTemplate } from '../../src/ui/pdf-job-status';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const progress = (phase: string, pagesCompleted?: number, estimatedPages?: number) => ({
  type: 'clear-writer-pdf-preview-progress' as const, requestId: 'r', phase: phase as never, pagesCompleted, estimatedPages
});

async function run(): Promise<void> {
  const host = document.getElementById('host');
  if (!host) throw new Error('Host missing.');
  host.innerHTML = pdfJobStatusTemplate();

  let cancels = 0;
  const status = createPdfJobStatus(() => { cancels += 1; });
  // A second export binds the same controls again. A click must reach only the
  // most recent export's handler, which owns the job that is running.
  createPdfJobStatus(() => { cancels += 100; });
  const strip = document.getElementById('pdf-job-status') as HTMLElement;
  const bar = document.getElementById('pdf-job-progress') as HTMLProgressElement;
  const announcer = document.getElementById('pdf-job-announcer') as HTMLElement;
  const cancelButton = document.getElementById('btn-pdf-job-cancel') as HTMLButtonElement;
  const label = document.getElementById('pdf-job-label') as HTMLElement;

  status.start();
  const startedVisible = !strip.hidden;
  const startedIndeterminate = !bar.hasAttribute('value');
  const startedAnnounced = announcer.textContent === 'PDF preview started.';

  status.update(progress('paginate', 25, 300));
  const barAt25 = bar.value === 25 && bar.max === 300;
  const milestone25 = announcer.textContent === 'Page 25 of about 300.';

  status.update(progress('paginate', 30, 300));
  const noAnnouncementBetween = announcer.textContent === 'Page 25 of about 300.';

  status.update(progress('paginate', 50, 300));
  const milestone50 = announcer.textContent === 'Page 50 of about 300.';

  cancelButton.focus();
  const focusable = document.activeElement === cancelButton && cancelButton.tagName === 'BUTTON';
  cancelButton.click();
  const cancelledOnce = cancels === 100;
  const cancelShowsState = label.textContent === 'Cancelling PDF preview…' && cancelButton.disabled;

  status.complete({ kind: 'cancelled' });
  const hiddenAfterCancel = strip.hidden && announcer.textContent === 'PDF preview cancelled.';

  // A new job after a cancel is not left disabled or pre-cancelled.
  status.start();
  const reusable = !cancelButton.disabled;
  status.complete({ kind: 'printing' });
  const readyAnnounced = announcer.textContent === 'PDF preview ready. The print dialog is open.';

  window.__HARNESS_RESULT__ = {
    ok: startedVisible && startedIndeterminate && startedAnnounced && barAt25 && milestone25
      && noAnnouncementBetween && milestone50 && focusable && cancelledOnce && cancelShowsState
      && hiddenAfterCancel && reusable && readyAnnounced,
    startedVisible, startedIndeterminate, startedAnnounced, barAt25, milestone25,
    noAnnouncementBetween, milestone50, focusable, cancelledOnce, cancelShowsState,
    hiddenAfterCancel, reusable, readyAnnounced
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
