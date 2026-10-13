import type { AssetResolver } from '../platform/types';
import type { ListStyle } from '../types';
import { compilePdfArtifactPrintCss, compilePrintCss } from '../print/PrintCssCompiler';
import { compilePrintDocument } from '../print/PrintDocumentCompiler';
import type { PrintLayoutSettings } from '../print/PrintLayoutSettings';
import { parseMarkdownImages } from '../images/markdownImages';
import type { PdfPreviewMarginData } from './contracts';

export const PDF_RENDER_COMPILER_VERSION = 'pdf-render-v2';

/** Exact, collision-free identity used to decide whether an artifact may be reused. */
export interface PdfArtifactKey {
  readonly compilerVersion: typeof PDF_RENDER_COMPILER_VERSION;
  readonly document: string;
  readonly stylesheet: string;
  readonly margins: string;
  readonly assets: string;
}

export interface PdfResolvedAsset {
  readonly source: string;
  readonly resolvedUrl: string;
}

/** Every mutable input required to render one final PDF. */
export interface PdfRenderSnapshot {
  readonly key: PdfArtifactKey;
  readonly html: string;
  readonly css: string;
  /** Applied only after Paged.js has created its physical page tree. */
  readonly artifactPrintCss: string;
  readonly listMarkerStyles: Readonly<Pick<ListStyle, 'bulletIcon'>> & {
    readonly parenthesized: Readonly<Pick<ListStyle, 'bulletIcon'>>;
  };
  readonly margins: Readonly<PdfPreviewMarginData>;
  readonly marginImageSources: Readonly<Record<string, string>>;
  readonly assets: readonly PdfResolvedAsset[];
}

export function createPdfRenderSnapshot(
  sourceHtml: string,
  layout: PrintLayoutSettings,
  assetResolver: AssetResolver
): PdfRenderSnapshot {
  const document = compilePrintDocument(sourceHtml, layout).html;
  const css = compilePrintCss(layout);
  const artifactPrintCss = compilePdfArtifactPrintCss(layout);
  const margins = Object.freeze({ header: layout.header, footer: layout.footer, metadata: layout.metadata });
  const assets = Object.freeze(resolveMarginAssets(layout, assetResolver));
  const marginImageSources = Object.freeze(Object.fromEntries(assets.map(asset => [asset.source, asset.resolvedUrl])));
  const key = Object.freeze({
    compilerVersion: PDF_RENDER_COMPILER_VERSION,
    document,
    stylesheet: css,
    margins: canonicalJson(margins),
    assets: canonicalJson(assets)
  });

  return Object.freeze({
    key,
    html: document,
    css,
    artifactPrintCss,
    listMarkerStyles: Object.freeze({
      bulletIcon: layout.lists.ol.bulletIcon,
      parenthesized: Object.freeze({ bulletIcon: layout.lists.olParen.bulletIcon })
    }),
    margins,
    marginImageSources,
    assets
  });
}

export function samePdfArtifactKey(left: PdfArtifactKey, right: PdfArtifactKey): boolean {
  return left.compilerVersion === right.compilerVersion
    && left.document === right.document
    && left.stylesheet === right.stylesheet
    && left.margins === right.margins
    && left.assets === right.assets;
}

function resolveMarginAssets(layout: PrintLayoutSettings, assetResolver: AssetResolver): PdfResolvedAsset[] {
  const assets = new Map<string, string>();
  for (const cell of [layout.header.left, layout.header.center, layout.header.right, layout.footer.left, layout.footer.center, layout.footer.right]) {
    for (const image of parseMarkdownImages(cell.content)) {
      if (!assets.has(image.source)) assets.set(image.source, assetResolver.resolveSync(image.source));
    }
  }
  return [...assets].map(([source, resolvedUrl]) => Object.freeze({ source, resolvedUrl }));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}
