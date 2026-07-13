import { compileMarkdown, compilePreviewDocument } from '../compiler';
import type { CompiledPreview } from '../compiler';
import { scanCustomBlockStyleIcons, scanMarkdownForImages } from '../services/ExportSnapshotService';
import { PreviewController } from '../preview';
import { previewMetrics } from '../perf/preview-metrics';
import type { AssetResolver } from '../platform/types';
import type { ListSetup, PageSetup, TableSetup, TypographySetup } from '../types';

/** Owns preview revisions, compilation, asset preparation, and render lanes. */
export class PreviewCoordinator {
  private readonly controller: PreviewController;
  private revision = 0;
  private readonly assetResolver: AssetResolver;

  constructor(stage: HTMLElement, assetResolver: AssetResolver) {
    this.assetResolver = assetResolver;
    this.controller = new PreviewController(stage, assetResolver);
  }

  get currentRevision(): number {
    return this.revision;
  }

  beginRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }

  applyPageSetup(setup: PageSetup, renderCachedDocument = true): void {
    this.controller.applyPageSetup(setup, renderCachedDocument);
  }

  applyTypographySetup(setup: TypographySetup): void {
    this.controller.applyTypographySetup(setup);
  }

  applyListSetup(setup: ListSetup): void {
    this.controller.applyListSetup(setup);
  }

  applyTableSetup(setup: TableSetup): void {
    this.controller.applyTableSetup(setup);
  }

  clear(): void {
    this.beginRevision();
    this.controller.clear();
  }

  async compileDocument(markdown: string, metricKind: 'single-document-edit' | 'single-document-load'): Promise<CompiledPreview> {
    const imagePaths = scanMarkdownForImages(markdown);
    await this.assetResolver.preloadImages([...imagePaths, ...scanCustomBlockStyleIcons()]);
    const started = performance.now();
    const compiled = await compilePreviewDocument(markdown, this.assetResolver, { sourceLineOffset: 2 });
    previewMetrics.recordPreviewCompile(metricKind, performance.now() - started);
    return compiled;
  }

  async compileFullDocument(markdown: string): Promise<string> {
    const started = performance.now();
    const compiled = await compileMarkdown(markdown, this.assetResolver);
    previewMetrics.recordPreviewCompile('full-document', performance.now() - started);
    return compiled;
  }

  publish(compiled: CompiledPreview, revision: number): void {
    this.controller.updateFastLane(compiled.html, compiled.manifest, revision);
    void this.controller.updateExactLane(compiled.html, compiled.manifest, revision);
  }

  forceRender(html: string, manifest: readonly import('../compiler/rehype-plugins').PreviewSourceManifestEntry[] = [], revision: number | null = null) {
    return this.controller.forceRender(html, manifest, revision);
  }

  scrollToTop(): void {
    this.controller.scrollToTop();
  }

  navigateToSourceLine(line: number): void {
    this.controller.navigateToSourceLine(line, this.revision);
  }
}
