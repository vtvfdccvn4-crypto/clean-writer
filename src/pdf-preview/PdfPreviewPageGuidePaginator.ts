import { IsolatedPaginationHost } from './IsolatedPaginationHost';
import type { PdfPreviewGuideJob, PdfPreviewPaginationOutcome, PdfPreviewGuideResult } from './contracts';

/** Lightweight new-route pagination used only for editor page-break guides. */
export class PdfPreviewPageGuidePaginator {
  private readonly paginationHost: IsolatedPaginationHost;

  constructor(paginationHost = new IsolatedPaginationHost()) {
    this.paginationHost = paginationHost;
  }

  paginate(input: PdfPreviewGuideJob, signal?: AbortSignal): Promise<PdfPreviewPaginationOutcome<PdfPreviewGuideResult>> {
    return this.paginationHost.requestPageGuides(input, signal);
  }
}
