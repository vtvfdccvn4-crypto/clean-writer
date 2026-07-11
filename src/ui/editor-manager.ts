import { APP_STATE_EVENTS, state } from '../state';
import { createEditor, DraftRecoveryStore } from '../editor';
import { extractWritingStatistics } from '../editor/writing-statistics';
import type { MarkdownEditor } from '../editor';
import { compileMarkdown } from '../compiler';
import { compileExportSnapshot as compileSnapshot, scanMarkdownForImages, scanCustomBlockStyleIcons } from '../services/ExportSnapshotService';
import { PreviewController } from '../preview';
import { previewMetrics } from '../perf/preview-metrics';
import { CoalescingTaskQueue } from '../utils/CoalescingTaskQueue';
import {
  renderDocumentSection
} from '../preview/document-rendering';
import type { Platform, PdfExportDocument } from '../platform/types';
import { showNotice } from './components/Notice';
import { showConfirmDialog } from './confirm-dialog';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { applyMarkdownCommand, type MarkdownCommand } from '../editor/markdown-commands';

export class EditorManager {
  private currentEditorView: MarkdownEditor | null = null;
  private previewController: PreviewController;
  private editorContainer: HTMLElement;
  private pagedStage: HTMLElement;
  private previewPane: HTMLElement;
  private previewRevision = 0;
  private statsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentFilePath: string | null = null;
  private selectionQueue: CoalescingTaskQueue<string>;
  private platform: Platform;
  private viewStates: Record<string, { selectionFrom: number; selectionTo: number; scrollTop: number }> = {};
  private pendingFocusLine: { path: string; line: number } | null = null;
  private saveInFlight: Promise<void> | null = null;
  private paginatedExportCache: { key: string; document: PdfExportDocument } | null = null;

  constructor(platform: Platform) {
    this.platform = platform;
    this.editorContainer = document.getElementById('editor-container')!;
    this.pagedStage = document.getElementById('paged-stage')!;
    this.previewPane = document.querySelector('.preview-pane')!;
    this.previewController = new PreviewController(this.pagedStage, this.platform.assetResolver);
    this.selectionQueue = new CoalescingTaskQueue(
      async (_reason, isLatest) => this.handleSelectionChange(isLatest),
      (reason, error) => this.reportWorkflowError(`Unable to complete ${reason}.`, error)
    );
    this.setPreviewVisible(Boolean(state.current.projectRef));

    state.on(APP_STATE_EVENTS.editorSetupChanged, () => {
      this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);
    });
    this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);

    // Bind state events
    state.on(APP_STATE_EVENTS.selectionChanged, () => {
      this.queueSelectionChange('selection change');
    });
    state.on(APP_STATE_EVENTS.projectChanged, () => {
      this.setPreviewVisible(Boolean(state.current.projectRef));
    });
    state.on(APP_STATE_EVENTS.projectSnapshotChanged, () => {
      this.applySnapshotSettings();
      this.setPreviewVisible(Boolean(state.current.projectRef));
      this.queueSelectionChange('project snapshot change');
    });
    state.on(APP_STATE_EVENTS.projectTreeChanged, () => {
      this.queueSelectionChange('project tree change');
    });
    state.on(APP_STATE_EVENTS.settingsSnapshotChanged, () => {
      this.applySnapshotSettings();
      this.queueSelectionChange('settings snapshot change');
    });
    state.on(APP_STATE_EVENTS.pageSetupChanged, () => {
      this.previewController.applyPageSetup(state.current.pageSetup);
    });
    state.on(APP_STATE_EVENTS.typographySetupChanged, () => {
      this.previewController.applyTypographySetup(state.current.typographySetup);
    });
    state.on(APP_STATE_EVENTS.listSetupChanged, () => {
      this.previewController.applyListSetup(state.current.listSetup);
    });
    state.on(APP_STATE_EVENTS.tableSetupChanged, () => {
      this.previewController.applyTableSetup(state.current.tableSetup);
    });
    state.on(APP_STATE_EVENTS.projectMetadataChanged, () => {
      this.queueSelectionChange('project metadata change');
    });

    // Apply initial defaults
    this.previewController.applyPageSetup(state.current.pageSetup);
    this.previewController.applyTypographySetup(state.current.typographySetup);
    this.previewController.applyListSetup(state.current.listSetup);
    this.previewController.applyTableSetup(state.current.tableSetup);
  }

  private applySnapshotSettings() {
    // The snapshot listener queues a fresh compile below, so rendering the cached
    // document here would briefly render stale content and duplicate the work.
    this.previewController.applyPageSetup(state.current.pageSetup, false);
    this.previewController.applyTypographySetup(state.current.typographySetup);
    this.previewController.applyListSetup(state.current.listSetup);
    this.previewController.applyTableSetup(state.current.tableSetup);
  }

  private queueSelectionChange(reason: string) {
    this.selectionQueue.request(reason);
  }

  private reportWorkflowError(message: string, error: unknown) {
    console.error(`[EditorManager] ${message}`, error);
    this.updateSaveStatus('error');
    showNotice(`${describeWorkspaceError(error, 'save')}\n\nYour current document has been kept open. Please retry or use Save before continuing.`, 'error');
  }

  private notifyProjectStatsChanged() {
    window.dispatchEvent(new Event('clear-writer-project-stats-refresh'));
  }

  private async handleSelectionChange(isLatest: () => boolean) {
    // DATA-INTEGRITY BOUNDARY: selection state is already updated when this
    // event runs, so flush the editor using its captured project/file identity
    // before destroying it or reading the next document.
    const previousFile = this.currentFilePath;
    try {
      await this.flushCurrentDocument();
    } catch (error) {
      if (previousFile && state.current.activeFile !== previousFile) {
        state.setActiveFile(previousFile);
      } else if (!previousFile && !state.current.isFullDocMode) {
        state.setFullDocMode();
      }
      throw error;
    }
    this.updateActiveSectionLabel(null);
    
    if (!isLatest()) return;
    const { isFullDocMode, activeFile, projectRef } = state.current;

    if (!projectRef) {
      this.renderEmptyWorkspace();
      return;
    }

    this.setPreviewVisible(true);

    if (isFullDocMode) {
      await this.renderFullDocument(isLatest);
    } else if (activeFile) {
      await this.renderSingleDocument(activeFile, isLatest);
    }
  }

  public renderEmptyWorkspace() {
    this.previewRevision += 1;
    this.setPreviewVisible(false);
    this.updateSaveStatus('idle');
    this.updateActiveSectionLabel(null);
    this.pendingFocusLine = null;
    if (this.currentEditorView) {
      this.saveViewState(this.currentFilePath);
      this.currentEditorView.destroy();
      this.currentEditorView = null;
    }
    this.currentFilePath = null;
    
    // Clear editor
    this.editorContainer.innerHTML = `
      <div class="empty-canvas">
        <div class="empty-canvas-mark" aria-hidden="true">✎</div>
        <h2 class="empty-canvas-title">No project opened</h2>
        <p class="empty-canvas-copy">Open a local folder or start a new browser project to begin writing.</p>
        <div class="empty-canvas-actions">
          <button
            id="empty-canvas-open-folder"
            type="button"
            class="empty-canvas-cta drawer-primary-button"
          >Open local folder</button>
          <button
            id="empty-canvas-new-project"
            type="button"
            class="empty-canvas-secondary toolbar-icon-button"
          >New project</button>
        </div>
      </div>
    `;

    this.editorContainer.querySelector('#empty-canvas-open-folder')?.addEventListener('click', () => {
      document.getElementById('btn-open')?.click();
    });
    this.editorContainer.querySelector('#empty-canvas-new-project')?.addEventListener('click', () => {
      document.getElementById('btn-new')?.click();
    });

    this.previewController.clear();
  }

  private setPreviewVisible(visible: boolean) {
    this.previewPane.classList.toggle('is-project-closed', !visible);
    this.previewPane.setAttribute('aria-hidden', String(!visible));
  }

  private async renderFullDocument(isLatest: () => boolean) {
    const revision = ++this.previewRevision;
    const { projectRef } = state.current;
    if (!projectRef) throw new Error('No project is open.');
    
    // Cleanup old editor
    if (this.currentEditorView) {
      this.saveViewState(this.currentFilePath);
      this.currentEditorView.destroy();
      this.currentEditorView = null;
    }
    this.currentFilePath = null;
    this.updateSaveStatus('idle');
    this.updateActiveSectionLabel('Full Document', 'Full Document Mode');
    this.pendingFocusLine = null;
    this.editorContainer.innerHTML = '<div style="padding: 40px; color: var(--text-muted); text-align: center;">Editor disabled in Full Document mode. Select a section to edit.</div>';
    
    const { sections } = state.current;
    if (!projectRef) throw new Error('No project is open.');

    if (!sections || sections.length === 0) {
      return;
    }

    const session = await this.platform.workspaceRepository.open(projectRef);
    const initialHtml = await compileSnapshot({
      session,
      assetResolver: this.platform.assetResolver,
      isFullDocMode: true,
      activeFile: null,
      sections
    }, {
      compile: async (markdown: string, assetResolver: typeof this.platform.assetResolver) => {
        // These counters are intentionally coarse: they let us compare the
        // number of preview compiles before and after snapshot-flow changes.
        const compileStarted = performance.now();
        const compiled = await compileMarkdown(markdown, assetResolver);
        previewMetrics.recordPreviewCompile('full-document', performance.now() - compileStarted);
        return compiled;
      }
    });
    if (revision !== this.previewRevision || !isLatest()) return;
    await this.previewController.forceRender(initialHtml);
  }

  private async renderSingleDocument(filename: string, isLatest: () => boolean) {
    const initialRevision = ++this.previewRevision;
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
    
    // Cleanup old editor
    if (this.currentEditorView) {
      this.saveViewState(this.currentFilePath);
      this.currentEditorView.destroy();
    }
    this.currentFilePath = filename;
    this.updateActiveSectionLabel(filename);
    this.editorContainer.innerHTML = '';
    
    this.updateSectionStats(content);

    // Callbacks for CodeMirror
    const callbacks = {
      onDirty: (newDoc: string) => {
        if (this.currentFilePath === filename && state.current.activeFile === filename) {
          DraftRecoveryStore.saveDraft(projectRef.id, filename, newDoc);
          this.updateSaveStatus('dirty');
          
          if (this.statsDebounceTimer) {
            clearTimeout(this.statsDebounceTimer);
          }
          this.statsDebounceTimer = setTimeout(() => {
            if (this.currentFilePath === filename) {
              this.updateSectionStats(newDoc);
            }
          }, 400);
        }
      },
      onChange: async (newDoc: string) => {
        const changeRevision = ++this.previewRevision;
        const sections = state.current.sections;
        const markdownToCompile = renderDocumentSection(
          {
            path: filename,
            markdown: newDoc
          },
          sections,
          0
        );

        // Preload referenced images in the updated Markdown
        const imagePaths = scanMarkdownForImages(markdownToCompile);
        await this.platform.assetResolver.preloadImages([...imagePaths, ...scanCustomBlockStyleIcons()]);
        if (changeRevision !== this.previewRevision
          || this.currentFilePath !== filename
          || state.current.activeFile !== filename) return;

        const compileStarted = performance.now();
        this.updateSaveStatus('saving');

        try {
          const [html] = await Promise.all([
            compileMarkdown(markdownToCompile, this.platform.assetResolver),
            session.writeSection(filename, newDoc)
          ]);
          previewMetrics.recordPreviewCompile('single-document-edit', performance.now() - compileStarted);

          // Compilation and session updates are asynchronous. Only the newest edit may
          // update the preview if several callbacks complete out of order.
          if (changeRevision !== this.previewRevision
            || this.currentFilePath !== filename
            || state.current.activeFile !== filename) return;
          
          DraftRecoveryStore.clearDraft(projectRef.id, filename);
          DraftRecoveryStore.markSaved(projectRef.id, filename);
          this.updateSaveStatus('saved');
          this.notifyProjectStatsChanged();

          // Two-Lane engine
          this.previewController.updateFastLane(html);
          this.previewController.updateExactLane(html);
        } catch (error) {
          if (changeRevision !== this.previewRevision
            || this.currentFilePath !== filename
            || state.current.activeFile !== filename) return;
          this.updateSaveStatus('error');
          this.reportWorkflowError(`Autosave failed for ${filename}.`, error);
        }
      },
      onCursorActivity: (line: number, isTextMutation: boolean) => {
        this.previewController.scrollToLine(line, isTextMutation);
      },
      onError: (error: unknown) => {
        this.updateSaveStatus('error');
        this.reportWorkflowError(`Autosave failed for ${filename}.`, error);
      }
    };

    this.currentEditorView = createEditor(this.editorContainer, content, callbacks);

    // Initial exact layout
    const { sections } = state.current;
    const markdownToCompile = renderDocumentSection(
      {
        path: filename,
        markdown: content
      },
      sections,
      0
    );

    // Preload referenced images in initial layout
    const imagePaths = scanMarkdownForImages(markdownToCompile);
    await this.platform.assetResolver.preloadImages([...imagePaths, ...scanCustomBlockStyleIcons()]);
    if (initialRevision !== this.previewRevision || !isLatest()) return;

    const compileStarted = performance.now();
    const initialHtml = await compileMarkdown(markdownToCompile, this.platform.assetResolver);
    previewMetrics.recordPreviewCompile('single-document-load', performance.now() - compileStarted);
    if (initialRevision !== this.previewRevision || !isLatest()) return;
    await this.previewController.forceRender(initialHtml);
    if (initialRevision !== this.previewRevision || !isLatest()) return;

    // Reset scroll positions to top
    this.previewController.scrollToTop();
    this.restoreViewState(filename);
    this.applyPendingFocusLine(filename);
    this.updateSaveStatus('saved');
  }

  private saveViewState(filename: string | null) {
    if (!filename || !this.currentEditorView) return;
    const { projectRef } = state.current;
    if (!projectRef) return;
    
    const key = `${projectRef.kind}:${projectRef.id}:${filename}`;
    const selection = this.currentEditorView.getSelection();
    const scrollTop = this.currentEditorView.view.scrollDOM.scrollTop;
    
    this.viewStates[key] = {
      selectionFrom: selection.from,
      selectionTo: selection.to,
      scrollTop
    };
  }

  private restoreViewState(filename: string) {
    if (!this.currentEditorView) return;
    const { projectRef } = state.current;
    if (!projectRef) return;
    
    const key = `${projectRef.kind}:${projectRef.id}:${filename}`;
    const saved = this.viewStates[key];
    if (saved) {
      // Clamp to document length
      const docLength = this.currentEditorView.getValue().length;
      const from = Math.min(Math.max(0, saved.selectionFrom), docLength);
      const to = Math.min(Math.max(0, saved.selectionTo), docLength);
      
      this.currentEditorView.setSelection(from, to);
      // Wait for layout/render to complete before setting scrollTop
      requestAnimationFrame(() => {
        if (this.currentEditorView && this.currentEditorView.view.scrollDOM) {
          this.currentEditorView.view.scrollDOM.scrollTop = saved.scrollTop;
        }
      });
    } else {
      this.currentEditorView.setSelection(0);
    }
  }

  public getEditorView() {
    return this.currentEditorView;
  }

  public insertTextAtCursor(text: string): boolean {
    if (!this.currentEditorView) return false;
    this.currentEditorView.insertText(text);
    this.currentEditorView.focus();
    return true;
  }

  public applyMarkdownCommand(command: MarkdownCommand): boolean {
    if (!this.currentEditorView) return false;
    applyMarkdownCommand(this.currentEditorView.view, command);
    return true;
  }

  public focusLine(line: number): void {
    const targetPath = state.current.activeFile ?? this.currentFilePath;
    if (!targetPath || !this.currentEditorView || this.currentFilePath !== targetPath) {
      if (targetPath) {
        this.pendingFocusLine = { path: targetPath, line };
      }
      return;
    }

    const view = this.currentEditorView.view;
    const docLine = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
    this.currentEditorView.setSelection(docLine.from);
    this.currentEditorView.focus();
  }

  public hasUnsavedChanges(): boolean {
    return this.currentEditorView ? this.currentEditorView.hasUnsavedChanges() : false;
  }

  public isSaveInFlight(): boolean {
    return this.saveInFlight !== null;
  }

  public async prepareForNavigation(): Promise<boolean> {
    try {
      await this.flushCurrentDocument();
      return true;
    } catch (error) {
      console.error('[EditorManager] Navigation blocked because the current section could not be saved:', error);
      showNotice('The current section could not be saved. Your changes remain open. Retry Save before continuing.', 'error');
      return false;
    }
  }

  public async flushCurrentDocument(): Promise<void> {
    if (this.saveInFlight) return this.saveInFlight;
    const editor = this.currentEditorView;
    if (!editor) return;
    if (!editor.hasUnsavedChanges()) return;
    this.updateSaveStatus('saving');
    this.saveInFlight = (async () => {
      try {
        await editor.flush();
        this.updateSaveStatus('saved');
      } catch (e) {
        this.updateSaveStatus('error');
        throw e;
      } finally {
        this.saveInFlight = null;
      }
    })();
    return this.saveInFlight;
  }

  /** Compile a fresh, durable snapshot; never export the preview cache. */
  public async compileExportSnapshot(): Promise<string> {
    await this.flushCurrentDocument();
    const { projectRef, isFullDocMode, activeFile, sections } = state.current;
    if (!projectRef) throw new Error('No project is open.');
    const session = await this.platform.workspaceRepository.open(projectRef);
    return compileSnapshot({
      session,
      assetResolver: this.platform.assetResolver,
      isFullDocMode,
      activeFile,
      sections,
      currentMarkdown: this.currentFilePath === activeFile && this.currentEditorView
        ? this.currentEditorView.getValue()
        : undefined
    }, {
      compile: compileMarkdown
    });
  }

  /** Compile and paginate the durable snapshot used by browser PDF export. */
  public async compilePaginatedExportSnapshot(): Promise<PdfExportDocument> {
    const exportStarted = performance.now();
    const cacheKey = this.getPaginatedExportCacheKey();
    if (this.paginatedExportCache?.key === cacheKey) {
      previewMetrics.recordPdfExportCache(true);
      previewMetrics.recordPdfExportPhase('orchestration-total', performance.now() - exportStarted);
      return this.paginatedExportCache.document;
    }
    previewMetrics.recordPdfExportCache(false);

    try {
      let rendered = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const snapshotStarted = performance.now();
        const html = await this.compileExportSnapshot();
        previewMetrics.recordPdfExportPhase('snapshot', performance.now() - snapshotStarted);
        const paginationStarted = performance.now();
        const renderResult = await this.previewController.forceRender(html);
        previewMetrics.recordPdfExportPhase('pagination', performance.now() - paginationStarted);
        if (renderResult.status === 'rendered') {
          rendered = true;
          break;
        }
        if (renderResult.status === 'degraded' || attempt === 1) {
          const detail = renderResult.error ? `: ${renderResult.error.message}` : '.';
          throw new Error(`PDF export pagination ${renderResult.status}${detail}`);
        }
        // A live preview render may supersede this export render while the
        // snapshot is being prepared. Rebuild once against the latest state.
      }
      if (!rendered) {
        throw new Error('PDF export pagination did not commit a render.');
      }
      const pageCount = this.pagedStage.querySelectorAll('.pagedjs_page').length;
      if (pageCount === 0) throw new Error('PDF export pagination produced no printable pages.');
      const document: PdfExportDocument = {
        html: this.pagedStage.innerHTML,
        pageSetup: state.current.pageSetup,
        isPaginated: true
      };
      if (this.getPaginatedExportCacheKey() === cacheKey) {
        this.paginatedExportCache = { key: cacheKey, document };
      } else {
        this.paginatedExportCache = null;
      }
      return document;
    } finally {
      previewMetrics.recordPdfExportPhase('orchestration-total', performance.now() - exportStarted);
    }
  }

  private getPaginatedExportCacheKey(): string {
    const current = state.current;
    return JSON.stringify([
      current.projectRevision,
      this.previewRevision,
      current.projectRef?.kind ?? null,
      current.projectRef?.id ?? null,
      current.activeFile,
      current.isFullDocMode
    ]);
  }

  private updateActiveSectionLabel(filename: string | null, customLabel?: string) {
    const labelEl = document.getElementById('active-section-label');
    if (!labelEl) return;
    if (filename === null) {
      labelEl.textContent = '';
      labelEl.title = '';
      labelEl.hidden = true;
      this.updateSectionStats(null);
    } else {
      const text = customLabel ?? (filename.split('/').pop() || filename);
      labelEl.textContent = text;
      labelEl.title = filename;
      labelEl.hidden = false;
    }
  }

  private updateSectionStats(markdown: string | null) {
    const statsLabel = document.getElementById('editor-section-stats');
    if (!statsLabel) return;
    
    if (markdown === null) {
      statsLabel.hidden = true;
      statsLabel.textContent = '';
      return;
    }

    const stats = extractWritingStatistics(markdown);
    statsLabel.textContent = `${stats.words.toLocaleString()} words • ~${stats.estimatedReadingTimeMinutes}m read`;
    statsLabel.hidden = false;
  }

  private updateSaveStatus(state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error') {
    const statusText = document.getElementById('editor-status');
    const statusDot = document.getElementById('editor-status-dot');
    if (!statusText || !statusDot) return;

    statusDot.className = 'status-dot ' + state;

    const labels = {
      idle: 'Ready',
      dirty: 'Unsaved changes',
      saving: 'Saving...',
      saved: 'Saved',
      error: 'Save failed'
    };

    statusText.textContent = labels[state];
    document.body.dataset.editorSaveState = state;
    document.querySelectorAll<HTMLElement>('.tree-row.active .section-save-indicator').forEach(indicator => {
      indicator.dataset.state = state;
      indicator.title = labels[state];
    });
    window.dispatchEvent(new CustomEvent('clear-writer-save-state', { detail: { state } }));
  }

  private applyPendingFocusLine(filename: string) {
    const pending = this.pendingFocusLine;
    if (!pending || pending.path !== filename || !this.currentEditorView) return;
    this.pendingFocusLine = null;
    this.focusLine(pending.line);
  }
}
