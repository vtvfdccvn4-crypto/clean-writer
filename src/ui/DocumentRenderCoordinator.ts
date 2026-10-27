import { state } from '../state';
import { createEditor, type EditorSnapshot } from '../editor';
import { createBrowserDraftStore, decideDraftRestore, hashDraftText, type DraftHealth, type DraftStore } from '../editor/DraftStore';
import { DraftWriter, LARGE_DRAFT_DOCUMENT_CHARACTERS, LARGE_DRAFT_NOTICE } from '../editor/DraftWriter';
import type { EditorCaretStatus } from '../editor/createEditor';
import { compileExportSnapshot as compileSnapshot } from '../services/ExportSnapshotService';
import { renderDocumentSection } from '../preview/document-rendering';
import { showNotice } from './components/Notice';
import { showConfirmDialog } from './confirm-dialog';
import { importPastedImage } from '../images/importPastedImage';
import { createPdfPreviewJob } from '../pdf-preview/PdfPreviewJobFactory';
import { PreviewPhaseTimer } from '../perf/preview-phase-timer';
import { previewMetrics } from '../perf/preview-metrics';
import type { PreviewCoordinator } from './PreviewCoordinator';
import type { DocumentSessionController } from './DocumentSessionController';
import type { EditorSaveStatus } from './EditorStatusController';
import type { PageGuideCoordinator } from './PageGuideCoordinator';
import type { Platform } from '../platform/types';
import { dispatchSectionSaved } from './outline-events';
import { captureCurrentPrintLayout, type CompiledPreviewCache, type LatestCompiledPreview } from './CompiledPreviewCache';
import { PreviewScheduler } from './PreviewScheduler';
import { isAbortError } from '../workers/CompileClient';
import { isLargeDocument } from '../preview/PreviewPolicy';
import type { CompiledPreview } from '../compiler';
import { updatePreviewFreshness, updateLivePreviewStatus } from './preview-freshness';
import { LivePreviewFreshness } from './live-preview-freshness';

/** Preview refresh pauses. Live preview is cheap enough to follow typing closely; the paginated preview runs a full layout, so it waits as long as it did when it followed autosave. */
const LIVE_PREVIEW_DELAY_MS = 250;
const PAGINATED_PREVIEW_DELAY_MS = 750;

/** The newest text of the open document, waiting for its preview refresh. */
interface PreviewEdit {
  readonly projectId: string;
  readonly filename: string;
  readonly snapshot: EditorSnapshot;
}

export interface DocumentRenderCoordinatorOptions {
  preview: PreviewCoordinator;
  platform: Platform;
  documentSession: DocumentSessionController;
  pageGuides: PageGuideCoordinator;
  editorContainer: HTMLElement;
  getIsFinalPrintPreview: () => boolean;
  getIsSupressingPreviewNavigation: () => boolean;
  scheduleCanonicalPageBreakGuides: () => void;
  syncFinalPrintPreviewToggle: () => void;
  /** Turns the print preview on or off, without rendering it. */
  setFinalPrintPreview: (active: boolean) => void;
  /** Builds the print preview for the open section, or re-renders it when it is on. */
  buildPrintPreview: () => Promise<void>;
  updateSaveStatus: (status: EditorSaveStatus) => void;
  updateActiveSectionLabel: (filename: string | null, customLabel?: string) => void;
  reportWorkflowError: (message: string, error: unknown) => void;
  updateSectionStats: (markdown: string | null) => void;
  updateCaretStatus: (status: EditorCaretStatus | null) => void;
  compiledPreviewCache: CompiledPreviewCache;
}

export class DocumentRenderCoordinator {
  private readonly preview: PreviewCoordinator;
  private readonly platform: Platform;
  private readonly documentSession: DocumentSessionController;
  private readonly pageGuides: PageGuideCoordinator;
  private readonly editorContainer: HTMLElement;
  private readonly opts: DocumentRenderCoordinatorOptions;
  private statsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly drafts: DraftStore = createBrowserDraftStore();
  private readonly draftWriter = new DraftWriter(this.drafts);
  private readonly largeDraftNoticeShownFor = new Set<string>();
  private readonly previewScheduler: PreviewScheduler<PreviewEdit>;
  /** True while a newly opened document sets its saved cursor, which follows to the preview unless the reader has moved. */
  private restoringViewState = false;
  /** Tells the reader when the live preview is behind the editor. */
  private readonly liveFreshness = new LivePreviewFreshness(updateLivePreviewStatus);
  /** The full document's compiled preview, kept so its print preview can be built on request. */
  private fullDocumentCompiled: CompiledPreview | null = null;

  constructor(opts: DocumentRenderCoordinatorOptions) {
    this.opts = opts;
    this.preview = opts.preview;
    this.platform = opts.platform;
    this.documentSession = opts.documentSession;
    this.pageGuides = opts.pageGuides;
    this.editorContainer = opts.editorContainer;
    this.previewScheduler = new PreviewScheduler<PreviewEdit>(
      edit => this.refreshPreviewForEdit(edit),
      () => (this.opts.getIsFinalPrintPreview() ? PAGINATED_PREVIEW_DELAY_MS : LIVE_PREVIEW_DELAY_MS)
    );
    this.drafts.onHealthChange(health => this.reportDraftHealth(health));
    void this.drafts.migrateLegacy(localStorage).catch(() => undefined);
    void this.drafts.prune();
    // Best-effort: a write that has not committed when the page goes away is lost,
    // which is why drafts are also written every few seconds while typing.
    const flushDrafts = () => { void this.draftWriter.flush(); };
    window.addEventListener('pagehide', flushDrafts);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushDrafts();
    });
  }

  private reportDraftHealth(health: DraftHealth): void {
    if (health === 'ok') return;
    showNotice(health === 'unavailable'
      ? 'Recovery drafts cannot be saved in this browser, so unsaved edits could be lost if the page closes. Your edits are still saved to the project as you type.'
      : 'A recovery draft could not be saved. It will be retried.', 'error');
  }

  get latestCompiledPreview(): LatestCompiledPreview | null {
    return this.opts.compiledPreviewCache.latest;
  }

  set latestCompiledPreview(value: LatestCompiledPreview | null) {
    this.opts.compiledPreviewCache.latest = value;
  }

  /** Exact shared layout input for PDF export and background page guides. */
  capturePrintLayout(pageSetup = state.current.pageSetup) {
    return captureCurrentPrintLayout(pageSetup);
  }

  async renderFullDocument(isLatest: () => boolean): Promise<void> {
    const sections = state.current.sections ?? [];
    const timing = new PreviewPhaseTimer({
      kind: 'document-preview',
      trigger: 'project-open',
      metadata: {
        sourceSectionCount: sections.filter(section => !section.isDir).length,
        sourceFileCount: sections.filter(section => !section.isDir).length
      }
    });
    let outcome: 'success' | 'stale' | 'cancelled' | 'failed' = 'success';
    let timingError: unknown;
    let sourceCharacterCount = 0;
    try {
      this.preview.setMode('paginated');
      this.previewScheduler.cancel();
      this.liveFreshness.settled();
      const revision = this.preview.beginRevision();
      this.preview.clearVisiblePreview();
      const { projectRef } = state.current;
      if (!projectRef) throw new Error('No project is open.');

      this.documentSession.destroyActive();
      this.editorContainer.replaceChildren();
      const fullDocumentNotice = document.createElement('div');
      fullDocumentNotice.className = 'editor-mode-placeholder';
      fullDocumentNotice.textContent = 'Editor disabled in Full Document mode';
      this.editorContainer.appendChild(fullDocumentNotice);
      this.opts.updateSaveStatus('idle');
      this.opts.updateActiveSectionLabel('Full Document', 'Full Document Mode');
      this.documentSession.clearPendingFocus();

      if (!sections.some(section => !section.isDir)) return;

      const endSnapshotLoad = timing.start('snapshot-load');
      const session = await this.platform.workspaceRepository.open(projectRef);
      endSnapshotLoad();
      const initialDocument = await compileSnapshot<import('../compiler').CompiledPreview>({
        session,
        assetResolver: this.platform.assetResolver,
        isFullDocMode: true,
        activeFile: null,
        sections,
        customBlockStyles: state.current.customBlockStyles,
        onPhase: (phase, durationMs) => timing.record(phase, durationMs)
      }, {
        compile: async (markdown: string, _assetResolver, sourceSegments) => {
          sourceCharacterCount = markdown.length;
          const endCompile = timing.start('compile');
          try {
            return await this.preview.compileFullDocument(
              markdown,
              sourceSegments,
              (phase, durationMs) => timing.record(phase, durationMs),
              compileCacheHit => timing.updateMetadata({ compileCacheHit })
            );
          } finally {
            endCompile();
          }
        }
      });
      timing.updateMetadata({
        sourceCharacterCount,
        compiledHtmlCharacterCount: initialDocument.html.length,
        manifestEntryCount: initialDocument.manifest.length
      });
      if (!this.preview.isCurrent(revision) || !isLatest()) {
        outcome = 'stale';
        return;
      }
      this.fullDocumentCompiled = initialDocument;
      if (isLargeDocument(sourceCharacterCount)) {
        // A large document is shown live. Its pagination runs only when the user asks.
        this.showLiveDocument(initialDocument, revision);
        updatePreviewFreshness('not-built', () => void this.buildFullDocumentPrintPreview());
        return;
      }
      updatePreviewFreshness(null, () => undefined);
      const endJobCreation = timing.start('create-pagination-job');
      const job = createPdfPreviewJob(initialDocument.html, this.capturePrintLayout(), this.platform.assetResolver);
      endJobCreation();
      this.pageGuides.cancel();
      const renderResult = await this.preview.forceRenderIsolated(
        job,
        initialDocument.html,
        initialDocument.manifest,
        revision,
        (phase, durationMs) => timing.record(phase, durationMs),
        pageTimings => timing.setPageTimings(pageTimings),
        stats => timing.updateMetadata(stats)
      );
      timing.updateMetadata({ pageCount: renderResult.pageCount });
      if (renderResult.status === 'stale') outcome = 'stale';
      else if (renderResult.status !== 'rendered') outcome = 'failed';
    } catch (error) {
      // A newer compile replaced this one: nothing is wrong, the result is just stale.
      if (isAbortError(error)) {
        outcome = 'stale';
        return;
      }
      outcome = 'failed';
      timingError = error;
      throw error;
    } finally {
      previewMetrics.recordPreviewTiming(timing.finish(outcome, { error: timingError }));
    }
  }

  async renderSingleDocument(filename: string, isLatest: () => boolean): Promise<void> {
    this.preview.setMode('paginated');
    this.previewScheduler.cancel();
    this.liveFreshness.settled();
    const initialRevision = this.preview.beginRevision();
    this.preview.clearVisiblePreview();
    const { projectRef } = state.current;
    if (!projectRef) throw new Error('No project is open.');

    const session = await this.platform.workspaceRepository.open(projectRef);
    const diskContent = await session.readSection(filename);
    let content = diskContent;
    if (!isLatest()) return;

    // The base hash identifies the file version on disk, so later saves can
    // tell whether a draft was written from this version.
    const target = { projectId: projectRef.id, path: filename };
    const baseHash = await hashDraftText(content);
    const lookup = await this.drafts.read(target);
    if (lookup && !lookup.intact) {
      showNotice(`A recovery draft for ${filename} is damaged and was not restored.`, 'error');
    } else if (lookup) {
      const decision = decideDraftRestore(lookup.record, baseHash);
      if (decision === 'discard') {
        await this.drafts.discard(target);
      } else {
        const shouldRestore = await showConfirmDialog({
          title: 'Unsaved Draft Found',
          message: decision === 'conflict'
            ? 'A recent unsaved draft of this section was found, but the file has changed since it was written. Would you like to restore the draft?'
            : 'A recent unsaved draft of this section was found. Would you like to restore it?',
          confirmLabel: 'Restore Draft',
          cancelLabel: 'Discard Draft'
        });
        if (!isLatest()) return;
        if (shouldRestore) {
          // The draft is not on disk. The editor opens on the file and the draft is applied as an edit below, so
          // autosave writes it and the status says it is unsaved until then.
          content = lookup.record.content;
        } else {
          await this.drafts.discard(target);
        }
      }
    }

    this.documentSession.destroyActive();
    this.opts.updateActiveSectionLabel(filename);
    this.editorContainer.innerHTML = '';

    this.opts.updateSectionStats(content);

    // The newest edit to this editor. A save that finishes behind it must not
    // report "saved", because the newer text is not on disk yet.
    let latestVersion = 0;
    const callbacks = {
      onDirty: (snapshot: EditorSnapshot) => {
        latestVersion = snapshot.version;
        if (this.documentSession.currentFilePath === filename && state.current.activeFile === filename) {
          this.draftWriter.schedule({ projectId: projectRef.id, path: filename }, snapshot, baseHash, snapshot.doc.length);
          if (snapshot.doc.length > LARGE_DRAFT_DOCUMENT_CHARACTERS && !this.largeDraftNoticeShownFor.has(filename)) {
            this.largeDraftNoticeShownFor.add(filename);
            showNotice(LARGE_DRAFT_NOTICE, 'info');
          }
          this.opts.updateSaveStatus('dirty');
          if (!this.opts.getIsFinalPrintPreview()) this.liveFreshness.typing();
          // Preview work is keyed to the edit, not to the autosave.
          // The revision advances when the refresh runs, not per keystroke:
          // starting a revision cancels in-flight pagination, which must not
          // be cancelled by every key press.
          this.previewScheduler.schedule({ projectId: projectRef.id, filename, snapshot });

          if (this.statsDebounceTimer) clearTimeout(this.statsDebounceTimer);
          this.statsDebounceTimer = setTimeout(() => {
            if (this.documentSession.currentFilePath === filename) {
              // The text is read once, after the pause, rather than on every keystroke.
              this.opts.updateSectionStats(snapshot.toString());
            }
          }, 400);
        }
      },
      onChange: async (snapshot: EditorSnapshot) => {
        const newDoc = snapshot.toString();
        const isOpen = () => this.documentSession.currentFilePath === filename
          && state.current.activeFile === filename;
        const isNewest = () => snapshot.version === latestVersion;

        // Status work belongs to the open document only. The write below does
        // not: a flush on the way to another document or a closed project runs
        // after selection has moved, and it must still persist.
        if (isOpen() && isNewest()) this.opts.updateSaveStatus('saving');

        try {
          let outcome = await session.writeSectionChecked(filename, newDoc);
          if (outcome === 'failed') {
            const refreshedSession = await this.platform.workspaceRepository.open(projectRef);
            outcome = await refreshedSession.writeSectionChecked(filename, newDoc);
          }
          if (outcome === 'conflict') {
            // The file changed outside Clear Writer. It is left as it is; this edit stays in its recovery draft.
            if (isOpen()) this.opts.updateSaveStatus('error');
            showNotice(`${filename} changed outside Clear Writer, so your latest edits were not saved. They are kept in recovery.`, 'error');
            console.warn(`[DocumentRenderCoordinator] ${filename} changed on disk; the save was skipped.`);
            return;
          }
          if (outcome !== 'saved') throw new Error(`Workspace rejected writes for ${filename}.`);

          const stillOpen = isOpen();
          // A newer edit to the open document owns its draft and the status bar.
          if (stillOpen && !isNewest()) return;

          // The write succeeded, so a draft holding this text is stale even when the
          // save was a flush on the way to another document or a closed project.
          await this.draftWriter.discardWhenSaved({ projectId: projectRef.id, path: filename }, newDoc, stillOpen);
          dispatchSectionSaved(filename);
          if (stillOpen) this.opts.updateSaveStatus('saved');
        } catch (error) {
          const stillOpen = isOpen();
          if (stillOpen && !isNewest()) return;
          // The draft is kept, so recovery can still offer the unsaved text.
          if (stillOpen) this.opts.updateSaveStatus('error');
          this.opts.reportWorkflowError(`Autosave failed for ${filename}.`, error);
        }
      },
      onError: (error: unknown) => {
        this.opts.updateSaveStatus('error');
        this.opts.reportWorkflowError(`Autosave failed for ${filename}.`, error);
      },
      onSelectionChange: (line: number) => {
        if (this.opts.getIsSupressingPreviewNavigation()) return;
        // Opening a document sets its saved cursor, and the preview follows it. A reader who has scrolled
        // the preview since the pages appeared is not pulled back by that automatic move.
        if (this.restoringViewState && this.preview.readerHasScrolledSinceCommit()) return;
        this.preview.navigateToSourceLine(line);
      },
      onCaretStatusChange: (status: EditorCaretStatus) => this.opts.updateCaretStatus(status),
      resolveImageSource: async (source: string) => {
        await this.platform.assetResolver.preloadImages([source]);
        return this.platform.assetResolver.resolveSync(source);
      },
      onImageFile: async (file: File) => {
        try {
          return await importPastedImage(session, file, filename, this.platform.assetResolver, state.current.imageSetup);
        } catch (error) {
          console.error('[DocumentRenderCoordinator] Failed to import pasted image.', error);
          showNotice('The pasted image could not be added to this project.', 'error');
          return null;
        }
      }
    };

    const editor = createEditor(this.editorContainer, diskContent, callbacks);
    this.documentSession.activate(projectRef, filename, editor);
    const restoredDraft = content !== diskContent;
    if (restoredDraft) {
      editor.setValue(content, true);
      showNotice(`Restored your unsaved draft of ${filename.split('/').pop() ?? filename}. It is being saved to the project.`, 'info');
    }
    const focusedPendingLine = this.documentSession.applyPendingFocus(filename);

    const { sections } = state.current;
    const markdownToCompile = renderDocumentSection(
      { path: filename, markdown: content },
      sections,
      0
    );

    let initialPreview: Awaited<ReturnType<PreviewCoordinator['compileDocument']>>;
    try {
      initialPreview = await this.preview.compileDocument(markdownToCompile, 'single-document-load');
    } catch (error) {
      if (isAbortError(error)) return;
      throw error;
    }
    if (!this.preview.isCurrent(initialRevision) || !isLatest()) return;
    this.latestCompiledPreview = {
      projectId: projectRef.id,
      documentPath: filename,
      markdown: content,
      compiled: initialPreview
    };

    if (isLargeDocument(markdownToCompile.length)) {
      // A large document opens live. The editor's print-preview setting is set on
      // every open, so the next document that is small enough opens in print again.
      this.opts.setFinalPrintPreview(false);
      this.opts.syncFinalPrintPreviewToggle();
      this.showLiveDocument(initialPreview, initialRevision);
      updatePreviewFreshness('not-built', () => void this.opts.buildPrintPreview());
    } else {
      updatePreviewFreshness(null, () => undefined);
      this.pageGuides.cancel();
      await this.preview.forceRenderIsolated(
        createPdfPreviewJob(initialPreview.html, this.capturePrintLayout(), this.platform.assetResolver),
        initialPreview.html,
        initialPreview.manifest,
        initialRevision
      );
      if (!this.preview.isCurrent(initialRevision) || !isLatest()) return;
      this.opts.syncFinalPrintPreviewToggle();
    }
    if (!this.preview.isCurrent(initialRevision) || !isLatest()) return;

    // The preview was reset to the top when this render began (clearVisiblePreview). It is not reset again
    // here: its pages are visible a moment before this point, and a reader who has scrolled must stay put.
    if (!focusedPendingLine) {
      this.restoringViewState = true;
      try {
        await this.documentSession.restoreViewState(projectRef, filename);
      } finally {
        this.restoringViewState = false;
      }
    }
    // Saved only if nothing is waiting to be written: a restored draft, or an edit made while the document
    // was still rendering, is saved by the autosave that follows.
    this.opts.updateSaveStatus(this.documentSession.currentEditor?.hasUnsavedChanges() ? 'dirty' : 'saved');
  }

  /** Recompiles and republishes the preview for an edit to the open document. */
  private refreshPreviewForEdit({ projectId, filename, snapshot }: PreviewEdit): void {
    if (this.documentSession.currentFilePath !== filename || state.current.activeFile !== filename) return;
    // Starting a revision drops any earlier refresh still running, so only this
    // edit's result can be published.
    const changeRevision = this.preview.beginRevision();
    const newDoc = snapshot.toString();
    const markdownToCompile = renderDocumentSection(
      { path: filename, markdown: newDoc },
      state.current.sections,
      0
    );
    const large = isLargeDocument(markdownToCompile.length);
    if (large && this.opts.getIsFinalPrintPreview()) {
      // Pagination of a large document runs only on request, so an edit only marks the print preview out of date.
      updatePreviewFreshness('out-of-date', () => void this.opts.buildPrintPreview());
      return;
    }

    if (!this.opts.getIsFinalPrintPreview()) this.liveFreshness.updating();
    void this.preview.compileLatestDocument(markdownToCompile)
      .then(compiledPreview => {
        if (!compiledPreview) return;
        if (!this.preview.isCurrent(changeRevision)
          || this.documentSession.currentFilePath !== filename
          || state.current.activeFile !== filename) return;
        this.latestCompiledPreview = {
          projectId,
          documentPath: filename,
          markdown: newDoc,
          compiled: compiledPreview
        };
        if (this.opts.getIsFinalPrintPreview()) {
          this.pageGuides.cancel();
          void this.preview.forceRenderIsolated(
            createPdfPreviewJob(compiledPreview.html, this.capturePrintLayout(), this.platform.assetResolver),
            compiledPreview.html,
            compiledPreview.manifest,
            changeRevision
          );
        } else {
          this.preview.publish(compiledPreview, changeRevision);
          this.liveFreshness.settled();
        }
      })
      .catch(previewError => {
        this.liveFreshness.settled();
        console.warn(`[DocumentRenderCoordinator] Preview refresh failed for ${filename}.`, previewError);
      });
    // Page-break guides paginate in the background, so a large document shows none until its print preview is built.
    if (!this.opts.getIsFinalPrintPreview() && !large) this.opts.scheduleCanonicalPageBreakGuides();
  }

  /** Shows the compiled document in the live preview, without paginating it. */
  private showLiveDocument(compiled: CompiledPreview, revision: number): void {
    this.preview.setMode('live');
    this.pageGuides.cancel();
    this.preview.publish(compiled, revision);
    this.opts.syncFinalPrintPreviewToggle();
  }

  /** Paginates the full document once, on request. */
  private async buildFullDocumentPrintPreview(): Promise<void> {
    const compiled = this.fullDocumentCompiled;
    if (!compiled) return;
    const revision = this.preview.beginRevision();
    this.preview.setMode('paginated');
    this.preview.clearVisiblePreview();
    this.pageGuides.cancel();
    const result = await this.preview.forceRenderIsolated(
      createPdfPreviewJob(compiled.html, this.capturePrintLayout(), this.platform.assetResolver),
      compiled.html,
      compiled.manifest,
      revision
    );
    if (result.status === 'rendered' && this.preview.isCurrent(revision)) updatePreviewFreshness(null, () => undefined);
  }
}
