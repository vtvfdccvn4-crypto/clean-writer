import type { AssetResolver } from '../platform/types';
import { createPdfRenderSnapshot } from './PdfRenderSnapshot';
import type { PrintLayoutSettings } from '../print/PrintLayoutSettings';
import type { PdfPreviewJob } from './contracts';

/** Builds immutable, browser-independent input for the isolated PDF-preview route. */
export function createPdfPreviewJob(
  sourceHtml: string,
  layout: PrintLayoutSettings,
  assetResolver: AssetResolver
): PdfPreviewJob {
  return createPdfRenderSnapshot(sourceHtml, layout, assetResolver);
}
