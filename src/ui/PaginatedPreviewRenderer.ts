import { state } from '../state';
import { renderDocumentSection } from '../preview/document-rendering';
import { createPdfPreviewJob } from '../pdf-preview/PdfPreviewJobFactory';
import type { PreviewCoordinator } from './PreviewCoordinator';
import type { DocumentRenderCoordinator } from './DocumentRenderCoordinator';
import type { DocumentSessionController } from './DocumentSessionController';
import type { PageGuideCoordinator, PageGuideComputation, PageGuideSnapshot } from './PageGuideCoordinator';
import type { Platform } from '../platform/types';
import type { IsolatedPaginationHost } from '../pdf-preview/IsolatedPaginationHost';

export interface PaginatedPreviewRendererOptions {
  preview: PreviewCoordinator;
  platform: Platform;
  pageGuides: PageGuideCoordinator;
  renderCoordinator: DocumentRenderCoordinator;
  isolatedPaginationHost: IsolatedPaginationHost;
  documentSession: DocumentSessionController;
  flushCurrentDocument: () => Promise<void>;
}

export class PaginatedPreviewRenderer {
  private _isActive = true;
  private pageGuideLayoutRevision = 0;
  private readonly opts: PaginatedPreviewRendererOptions;
  private readonly preview: PreviewCoordinator;
  private readonly platform: Platform;
  private readonly pageGuides: PageGuideCoordinator;
  private readonly renderCoordinator: DocumentRenderCoordinator;
  private readonly isolatedPaginationHost: IsolatedPaginationHost;
  private readonly documentSession: DocumentSessionController;

  constructor(opts: PaginatedPreviewRendererOptions) {
    this.opts = opts;
    this.preview = opts.preview;
    this.platform = opts.platform;
    this.pageGuides = opts.pageGuides;
    this.renderCoordinator = opts.renderCoordinator;
    this.isolatedPaginationHost = opts.isolatedPaginationHost;
    this.documentSession = opts.documentSession;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /** Set the paginated-preview flag without syncing the button UI. */
  setActive(value: boolean): void {
    this._isActive = value;
  }

  /** Sync the toolbar toggle button to the current mode. */
  syncToggle(): void {
    const button = document.getElementById('btn-toggle-print-preview');
    if (!(button instanceof HTMLButtonElement)) return;
    const isShowingFinalPreview = !state.current.isFullDocMode && this._isActive;
    button.setAttribute('aria-pressed', String(isShowingFinalPreview));
    button.setAttribute('aria-label', isShowingFinalPreview ? 'Return to canonical editor' : 'Show final print preview');
    button.title = isShowingFinalPreview ? 'Return to canonical editor' : 'Show final print preview';
  }

  clearGuides(): void {
    this.pageGuides.clear();
  }

  /** Debounces an isolated print-layout pass without delaying editor feedback. */
  scheduleGuides(layoutChanged = false): void {
    if (layoutChanged) this.pageGuideLayoutRevision += 1;
    if (!this._isActive) this.pageGuides.schedule(layoutChanged ? 'layout' : 'typing');
  }

  public async toggle(): Promise<void> {
    const { projectRef, activeFile, sections } = state.current;
    const editor = this.documentSession.currentEditor;
    if (!projectRef || !activeFile || !editor) return;

    await this.opts.flushCurrentDocument();
    const visiblePaginatedGuides = this._isActive
      ? this.preview.getPaginatedPageBreakGuides()
      : [];
    this._isActive = !this._isActive;
    this.syncToggle();
    if (this._isActive) this.clearGuides();

    const revision = this.preview.beginRevision();
    this.preview.setMode(this._isActive ? 'paginated' : 'live');
    this.preview.clearVisiblePreview();
    const markdown = renderDocumentSection({ path: activeFile, markdown: editor.getValue() }, sections, 0);
    const compiled = await this.preview.compileDocument(markdown, 'single-document-load');
    if (!this.preview.isCurrent(revision)
      || state.current.activeFile !== activeFile
      || !this.documentSession.currentEditor) return;
    if (this._isActive) {
      this.pageGuides.cancel();
      await this.preview.forceRenderIsolated(
        createPdfPreviewJob(compiled.html, this.renderCoordinator.capturePrintLayout(), this.platform.assetResolver),
        compiled.html,
        compiled.manifest,
        revision
      );
    } else {
      await this.preview.forceRender(compiled.html, compiled.manifest, revision);
    }
    this.preview.scrollToTop();
    if (!this._isActive) {
      if (visiblePaginatedGuides.length > 0) this.preview.setCanonicalPageBreakGuides(visiblePaginatedGuides);
      this.scheduleGuides();
    }
  }

  getSnapshot(): PageGuideSnapshot | null {
    const editor = this.documentSession.currentEditor;
    const { projectRef, activeFile } = state.current;
    if (!editor || !projectRef || !activeFile || this._isActive) return null;
    return {
      projectId: projectRef.id,
      documentPath: activeFile,
      markdown: editor.getValue(),
      layoutRevision: this.pageGuideLayoutRevision
    };
  }

  async compute(snapshot: PageGuideSnapshot, signal: AbortSignal): Promise<PageGuideComputation> {
    try {
      const markdown = renderDocumentSection(
        { path: snapshot.documentPath, markdown: snapshot.markdown },
        state.current.sections,
        0
      );
      const cached = this.renderCoordinator.latestCompiledPreview;
      const compiled = cached
        && cached.projectId === snapshot.projectId
        && cached.documentPath === snapshot.documentPath
        && cached.markdown === snapshot.markdown
        ? cached.compiled
        : await this.preview.compileDocument(markdown, 'single-document-edit');
      if (signal.aborted) return { status: 'cancelled', guides: [] };

      const layout = this.renderCoordinator.capturePrintLayout();
      const outcome = await this.isolatedPaginationHost.requestPrintArtifact(
        createPdfPreviewJob(compiled.html, layout, this.platform.assetResolver),
        undefined,
        signal
      );
      if (signal.aborted || outcome.status === 'cancelled') return { status: 'cancelled', guides: [] };
      if (outcome.status !== 'success') throw new Error(outcome.message);
      const manifestByAnchor = new Map(compiled.manifest.map(entry => [entry.anchor, entry]));
      return {
        status: 'rendered',
        guides: outcome.result.artifact.pages.flatMap(page => page.anchor ? [{
          pageNumber: page.number,
          anchor: page.anchor,
          sourceLine: manifestByAnchor.get(page.anchor)?.range.startLine
        }] : [])
      };
    } catch (error) {
      if (signal.aborted) return { status: 'cancelled', guides: [] };
      console.warn('[PaginatedPreviewRenderer] Canonical page-guide refresh failed.', error);
      return { status: 'failed', guides: [] };
    }
  }

  isCurrent(snapshot: PageGuideSnapshot): boolean {
    return !this._isActive
      && state.current.projectRef?.id === snapshot.projectId
      && state.current.activeFile === snapshot.documentPath
      && this.documentSession.currentFilePath === snapshot.documentPath
      && this.documentSession.currentEditor?.getValue() === snapshot.markdown
      && this.pageGuideLayoutRevision === snapshot.layoutRevision;
  }
}
