import { state } from '../state';
import { createEditor, DraftRecoveryStore } from '../editor';
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

  constructor(opts: DocumentRenderCoordinatorOptions) {
    this.opts = opts;
    this.preview = opts.preview;
    this.platform = opts.platform;
    this.documentSession = opts.documentSession;
    this.pageGuides = opts.pageGuides;
    this.editorContainer = opts.editorContainer;
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
        onPhase: (phase, durationMs) => timing.record(phase, durationMs)
      }, {
        compile: async (markdown: string, _assetResolver, sourceSegments) => {
          sourceCharacterCount = markdown.length;
          const endCompile = timing.start('compile');
          try {
            return await this.preview.compileFullDocument(markdown, sourceSegments, (phase, durationMs) => timing.record(phase, durationMs));
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
      outcome = 'failed';
      timingError = error;
      throw error;
    } finally {
      previewMetrics.recordPreviewTiming(timing.finish(outcome, { error: timingError }));
    }
  }

  async renderSingleDocument(filename: string, isLatest: () => boolean): Promise<void> {
    this.preview.setMode('paginated');
    const initialRevision = this.preview.beginRevision();
    this.preview.clearVisiblePreview();
    const { projectRef } = state.current;
    if (!projectRef) throw new Error('No project is open.');

    const session = await this.platform.workspaceRepository.open(projectRef);
    let content = await session.readSection(filename);
    if (!isLatest()) return;

    const draft = DraftRecoveryStore.getDraft(projectRef.id, filename);
    if (draft !== null && draft !== content) {
      const shouldRestore = await showConfirmDialog({
        title: 'Unsaved Draft Found',
        message: 'A recent unsaved draft of this section was found. Would you like to restore it?',
        confirmLabel: 'Restore Draft',
        cancelLabel: 'Discard Draft'
      });
      if (!isLatest()) return;
      if (shouldRestore) {
        content = draft;
      } else {
        DraftRecoveryStore.clearDraft(projectRef.id, filename);
      }
    }

    this.documentSession.destroyActive();
    this.opts.updateActiveSectionLabel(filename);
    this.editorContainer.innerHTML = '';

    this.opts.updateSectionStats(content);

    const callbacks = {
      onDirty: (newDoc: string) => {
        if (this.documentSession.currentFilePath === filename && state.current.activeFile === filename) {
          DraftRecoveryStore.saveDraft(projectRef.id, filename, newDoc);
          this.opts.updateSaveStatus('dirty');

          if (this.statsDebounceTimer) clearTimeout(this.statsDebounceTimer);
          this.statsDebounceTimer = setTimeout(() => {
            if (this.documentSession.currentFilePath === filename) {
              this.opts.updateSectionStats(newDoc);
            }
          }, 400);
        }
      },
      onChange: async (newDoc: string) => {
        const isOpen = () => this.documentSession.currentFilePath === filename
          && state.current.activeFile === filename;
        const changeRevision = this.preview.beginRevision();

        // Preview and status work belong to the open document only. The write
        // below does not: a flush on the way to another document or a closed
        // project runs after selection has moved, and it must still persist.
        if (isOpen()) this.refreshPreviewForEdit(projectRef.id, filename, newDoc, changeRevision);

        try {
          let saved = await session.writeSection(filename, newDoc);
          if (!saved) {
            const refreshedSession = await this.platform.workspaceRepository.open(projectRef);
            saved = await refreshedSession.writeSection(filename, newDoc);
          }
          if (!saved) throw new Error(`Workspace rejected writes for ${filename}.`);

          const stillOpen = isOpen();
          // A newer edit to the open document owns its draft and the status bar.
          if (stillOpen && !this.preview.isCurrent(changeRevision)) return;

          // The write succeeded, so this file's draft is stale even when the save
          // was a flush on the way to another document or a closed project.
          DraftRecoveryStore.clearDraft(projectRef.id, filename);
          DraftRecoveryStore.markSaved(projectRef.id, filename);
          dispatchSectionSaved(filename);
          if (stillOpen) this.opts.updateSaveStatus('saved');
        } catch (error) {
          const stillOpen = isOpen();
          if (stillOpen && !this.preview.isCurrent(changeRevision)) return;
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

    this.documentSession.activate(projectRef, filename, createEditor(this.editorContainer, content, callbacks));
    const focusedPendingLine = this.documentSession.applyPendingFocus(filename);

    const { sections } = state.current;
    const markdownToCompile = renderDocumentSection(
      { path: filename, markdown: content },
      sections,
      0
    );

    const initialPreview = await this.preview.compileDocument(markdownToCompile, 'single-document-load');
    if (!this.preview.isCurrent(initialRevision) || !isLatest()) return;
    this.latestCompiledPreview = {
      projectId: projectRef.id,
      documentPath: filename,
      markdown: content,
      compiled: initialPreview
    };

    this.pageGuides.cancel();
    await this.preview.forceRenderIsolated(
      createPdfPreviewJob(initialPreview.html, this.capturePrintLayout(), this.platform.assetResolver),
      initialPreview.html,
      initialPreview.manifest,
      initialRevision
    );
    if (!this.preview.isCurrent(initialRevision) || !isLatest()) return;
    this.opts.syncFinalPrintPreviewToggle();

    this.preview.scrollToTop();
    if (!focusedPendingLine) {
      await this.documentSession.restoreViewState(projectRef, filename);
    }
    this.opts.updateSaveStatus('saved');
  }

  /** Recompiles and republishes the preview for an edit to the open document. */
  private refreshPreviewForEdit(projectId: string, filename: string, newDoc: string, changeRevision: number): void {
    const markdownToCompile = renderDocumentSection(
      { path: filename, markdown: newDoc },
      state.current.sections,
      0
    );

    this.opts.updateSaveStatus('saving');

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
        }
      })
      .catch(previewError => {
        console.warn(`[DocumentRenderCoordinator] Preview refresh failed for ${filename}.`, previewError);
      });
    if (!this.opts.getIsFinalPrintPreview()) this.opts.scheduleCanonicalPageBreakGuides();
  }
}
