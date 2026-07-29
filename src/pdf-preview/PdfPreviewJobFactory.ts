import type { AssetResolver } from '../platform/types';
import { parseMarkdownImages } from '../images/markdownImages';
import { compilePrintCss } from '../print/PrintCssCompiler';
import { compilePrintDocument } from '../print/PrintDocumentCompiler';
import type { PrintLayoutSettings } from '../print/PrintLayoutSettings';
import type { PdfPreviewGuideJob, PdfPreviewJob } from './contracts';

/** Builds immutable, browser-independent input for the isolated PDF-preview route. */
export function createPdfPreviewJob(
  sourceHtml: string,
  layout: PrintLayoutSettings,
  assetResolver: AssetResolver
): PdfPreviewJob {
  const printDocument = compilePrintDocument(sourceHtml, layout);
  return {
    html: printDocument.html,
    css: compilePrintCss(layout),
    layout,
    margins: { header: layout.header, footer: layout.footer, metadata: layout.metadata },
    marginImageSources: resolveMarginImageSources(layout, assetResolver)
  };
}

/** Builds the compact page-guide variant; guides do not need print margins. */
export function createPdfPreviewGuideJob(sourceHtml: string, layout: PrintLayoutSettings): PdfPreviewGuideJob {
  return {
    html: compilePrintDocument(sourceHtml, layout).html,
    css: compilePrintCss(layout)
  };
}

export function resolveMarginImageSources(
  layout: PrintLayoutSettings,
  assetResolver: AssetResolver
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const cell of [layout.header.left, layout.header.center, layout.header.right, layout.footer.left, layout.footer.center, layout.footer.right]) {
    for (const image of parseMarkdownImages(cell.content)) {
      if (!resolved[image.source]) resolved[image.source] = assetResolver.resolveSync(image.source);
    }
  }
  return resolved;
}
