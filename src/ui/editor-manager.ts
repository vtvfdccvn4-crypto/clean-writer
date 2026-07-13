import { state } from '../state';
import { createEditor, DraftRecoveryStore } from '../editor';
import { extractWritingStatistics } from '../editor/writing-statistics';
import type { MarkdownEditor } from '../editor';
import { compileMarkdown } from '../compiler';
import { compileExportSnapshot as compileSnapshot } from '../services/ExportSnapshotService';
import { previewMetrics } from '../perf/preview-metrics';
import { CoalescingTaskQueue } from '../utils/CoalescingTaskQueue';
import { renderDocumentSection } from '../preview/document-rendering';
import type { Platform, PdfExportDocument } from '../platform/types';
import { showNotice } from './components/Notice';
import { showConfirmDialog } from './confirm-dialog';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { applyMarkdownCommand, type MarkdownCommand } from '../editor/markdown-commands';
import { PreviewCoordinator } from './PreviewCoordinator';
import { DocumentSessionController } from './DocumentSessionController';
import { DocumentNavigationController } from './DocumentNavigationController';

export class EditorManager {
  private preview: PreviewCoordinator;
  private editorContainer: HTMLElement;
  private pagedStage: HTMLElement;
  private previewPane: HTMLElement;
  private statsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly documentSession = new DocumentSessionController();
  private selectionQueue: CoalescingTaskQueue<string>;
  private readonly documentNavigation = new DocumentNavigationController();
  private navigationCommandActive = false;
  private platform: Platform;
  private saveInFlight: Promise<void> | null = null;
  private paginatedExportCache: { key: string; document: PdfExportDocument } | null = null;

  constructor(platform: Platform) {
    this.platform = platform;
    this.editorContainer = document.getElementById('editor-container')!;
    this.pagedStage = document.getElementById('paged-stage')!;
    this.previewPane = document.querySelector('.preview-pane')!;
    this.preview = new PreviewCoordinator(this.pagedStage, this.platform.assetResolver);
    this.selectionQueue = new CoalescingTaskQueue(
      async (_reason, isLatest) => this.handleSelectionChange(isLatest),
      (reason, error) => this.reportWorkflowError(`Unable to complete ${reason}.`, error)
    );
    this.setPreviewVisible(Boolean(state.current.projectRef));

    state.onEditorSetupChanged(() => {
      this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);
    });
    this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);

    // Bind state events
    state.onSelectionChanged(() => {
      if (this.navigationCommandActive) return;
      this.queueSelectionChange('selection change');
    });
    state.onProjectChanged(() => {
      this.setPreviewVisible(Boolean(state.current.projectRef));
    });
    state.onProjectSnapshotChanged(() => {
      this.applySnapshotSettings();
      this.setPreviewVisible(Boolean(state.current.projectRef));
      this.queueSelectionChange('project snapshot change');
    });
    state.onProjectTreeChanged(() => {
      this.queueSelectionChange('project tree change');
    });
    state.onSettingsSnapshotChanged(() => {
      this.applySnapshotSettings();
      this.queueSelectionChange('settings snapshot change');
    });
    state.onPageSetupChanged(() => {
      this.preview.applyPageSetup(state.current.pageSetup);
    });
    state.onTypographySetupChanged(() => {
      this.preview.applyTypographySetup(state.current.typographySetup);
    });
    state.onListSetupChanged(() => {
      this.preview.applyListSetup(state.current.listSetup);
    });
    state.onTableSetupChanged(() => {
      this.preview.applyTableSetup(state.current.tableSetup);
    });
    state.onProjectMetadataChanged(() => {
      this.queueSelectionChange('project metadata change');
    });

    // Apply initial defaults
    this.preview.applyPageSetup(state.current.pageSetup);
    this.preview.applyTypographySetup(state.current.typographySetup);
    this.preview.applyListSetup(state.current.listSetup);
    this.preview.applyTableSetup(state.current.tableSetup);
  }

  private get currentEditorView(): MarkdownEditor | null {
    return this.documentSession.currentEditor;
  }

  private get currentFilePath(): string | null {
    return this.documentSession.currentFilePath;
  }

  private applySnapshotSettings() {
    // The snapshot listener queues a fresh compile below, so rendering the cached
    // document here would briefly render stale content and duplicate the work.
    this.preview.applyPageSetup(state.current.pageSetup, false);
    this.preview.applyTypographySetup(state.current.typographySetup);
    this.preview.applyListSetup(state.current.listSetup);
    this.preview.applyTableSetup(state.current.tableSetup);
    this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);
  }

  private queueSelectionChange(reason: string) {
    this.selectionQueue.request(reason);
  }

  private reportWorkflowError(message: string, error: unknown) {
    console.error(`[EditorManager] ${message}`, error);
    this.updateSaveStatus('error');
    showNotice(`${describeWorkspaceError(error, 'save')}\n\nYour current document has been kept open. Reconnect the project and try again before continuing.`, 'error');
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

    this.editorContainer.closest('.editor-pane')?.classList.remove('is-welcome');
    this.editorContainer.closest('.workspace')?.classList.remove('is-welcome');
    this.setPreviewVisible(true);

    if (isFullDocMode) {
      await this.renderFullDocument(isLatest);
    } else if (activeFile) {
      await this.renderSingleDocument(activeFile, isLatest);
    }

  }

  public renderEmptyWorkspace() {
    this.preview.beginRevision();
    this.setPreviewVisible(false);
    this.updateSaveStatus('idle');
    this.updateActiveSectionLabel(null);
    this.documentSession.clearPendingFocus();
    this.documentSession.destroyActive();
    this.editorContainer.closest('.editor-pane')?.classList.add('is-welcome');
    this.editorContainer.closest('.workspace')?.classList.add('is-welcome');
    
    // Keep the welcome page deliberately lightweight: project actions remain
    // owned by SidebarController, and this page simply invokes them.
    this.editorContainer.innerHTML = `
      <div class="empty-canvas welcome-screen">
        <div class="welcome-content">
          <header class="welcome-brand">
            <span class="welcome-brand-mark" aria-hidden="true">C</span>
            <h1>Clear Writer</h1>
          </header>
          <section class="welcome-section" aria-labelledby="welcome-start-title">
            <h2 id="welcome-start-title">Start</h2>
            <div class="welcome-actions">
              <button id="empty-canvas-new-project" type="button" class="welcome-action">
                <span class="welcome-action-icon" aria-hidden="true">+</span>
                <span>New Document</span>
              </button>
              <button id="empty-canvas-open-folder" type="button" class="welcome-action">
                <span class="welcome-action-icon welcome-action-icon-folder" aria-hidden="true"></span>
                <span>Open Document</span>
              </button>
            </div>
          </section>
          <section id="welcome-recents" class="welcome-section welcome-recents" aria-labelledby="welcome-recent-title" hidden>
            <h2 id="welcome-recent-title">Recent</h2>
            <div id="welcome-recent-list" class="welcome-recent-list"></div>
          </section>
        </div>
      </div>
    `;

    this.editorContainer.querySelector('#empty-canvas-open-folder')?.addEventListener('click', () => {
      document.getElementById('btn-open')?.click();
    });
    this.editorContainer.querySelector('#empty-canvas-new-project')?.addEventListener('click', () => {
      document.getElementById('btn-new')?.click();
    });
    this.populateWelcomeRecents();

    this.preview.clear();
  }

  private async populateWelcomeRecents() {
    const recentSection = this.editorContainer.querySelector<HTMLElement>('#welcome-recents');
    const recentList = this.editorContainer.querySelector<HTMLElement>('#welcome-recent-list');
    const listKnownWorkspaces = this.platform.workspaceRepository.listKnownBrowserWorkspaces;
    if (!recentSection || !recentList || !listKnownWorkspaces) return;

    try {
      const recents = await listKnownWorkspaces.call(this.platform.workspaceRepository);
      // The user may have already opened a document while the asynchronous
      // catalogue lookup was in progress.
      if (!this.editorContainer.contains(recentSection) || recents.length === 0) return;

      for (const entry of recents.slice(0, 8)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'welcome-recent-item';
        button.title = entry.displayName;

        const name = document.createElement('span');
        name.className = 'welcome-recent-name';
        name.textContent = entry.displayName;
        const kind = document.createElement('span');
        kind.className = 'welcome-recent-kind';
        kind.textContent = entry.ref.kind === 'directory' ? 'Local folder' : 'Browser storage';
        button.append(name, kind);
        button.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('clear-writer-open-recent', { detail: { ref: entry.ref } }));
        });
        recentList.append(button);
      }
      recentSection.hidden = recentList.childElementCount === 0;
    } catch (error) {
      console.warn('Unable to load recent documents for the welcome page:', error);
    }
  }

  private setPreviewVisible(visible: boolean) {
    this.previewPane.classList.toggle('is-project-closed', !visible);
    this.previewPane.setAttribute('aria-hidden', String(!visible));
  }

  private async renderFullDocument(isLatest: () => boolean) {
    const revision = this.preview.beginRevision();
    const { projectRef } = state.current;
    if (!projectRef) throw new Error('No project is open.');
    
    // Cleanup old editor
    this.documentSession.destroyActive();
    this.updateSaveStatus('idle');
    this.updateActiveSectionLabel('Full Document', 'Full Document Mode');
    this.documentSession.clearPendingFocus();
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
      compile: async (markdown: string) => {
        // These counters are intentionally coarse: they let us compare the
        // number of preview compiles before and after snapshot-flow changes.
        return this.preview.compileFullDocument(markdown);
      }
    });
    if (!this.preview.isCurrent(revision) || !isLatest()) return;
    await this.preview.forceRender(initialHtml);
  }

  private async renderSingleDocument(filename: string, isLatest: () => boolean) {
    const initialRevision = this.preview.beginRevision();
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
    this.documentSession.destroyActive();
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
        const changeRevision = this.preview.beginRevision();
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
        if (!this.preview.isCurrent(changeRevision)
          || this.currentFilePath !== filename
          || state.current.activeFile !== filename) return;

        this.updateSaveStatus('saving');

        try {
          const [compiledPreview] = await Promise.all([
            this.preview.compileDocument(markdownToCompile, 'single-document-edit'),
            session.writeSection(filename, newDoc)
          ]);

          // Compilation and session updates are asynchronous. Only the newest edit may
          // update the preview if several callbacks complete out of order.
          if (!this.preview.isCurrent(changeRevision)
            || this.currentFilePath !== filename
            || state.current.activeFile !== filename) return;
          
          DraftRecoveryStore.clearDraft(projectRef.id, filename);
          DraftRecoveryStore.markSaved(projectRef.id, filename);
          this.updateSaveStatus('saved');
          this.notifyProjectStatsChanged();

          // Two-Lane engine
          this.preview.publish(compiledPreview, changeRevision);
        } catch (error) {
          if (!this.preview.isCurrent(changeRevision)
            || this.currentFilePath !== filename
            || state.current.activeFile !== filename) return;
          this.updateSaveStatus('error');
          this.reportWorkflowError(`Autosave failed for ${filename}.`, error);
        }
      },
      onError: (error: unknown) => {
        this.updateSaveStatus('error');
        this.reportWorkflowError(`Autosave failed for ${filename}.`, error);
      },
      onSelectionChange: (line: number) => {
        this.preview.navigateToSourceLine(line);
      }
    };

    this.documentSession.activate(projectRef, filename, createEditor(this.editorContainer, content, callbacks));

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
    const initialPreview = await this.preview.compileDocument(markdownToCompile, 'single-document-load');
    if (!this.preview.isCurrent(initialRevision) || !isLatest()) return;
    await this.preview.forceRender(initialPreview.html, initialPreview.manifest, initialRevision);
    if (!this.preview.isCurrent(initialRevision) || !isLatest()) return;

    // Reset scroll positions to top
    this.preview.scrollToTop();
    this.documentSession.restoreViewState(projectRef, filename);
    this.documentSession.applyPendingFocus(filename);
    this.updateSaveStatus('saved');
  }

  public getEditorView() {
    return this.currentEditorView;
  }

  /** Selects a document and resolves after the corresponding editor render settles. */
  public async openDocument(path: string): Promise<void> {
    // Persist under the current file identity before publishing the next one.
    // The autosave callback intentionally rejects writes once selection changes.
    await this.flushCurrentDocument();
    this.navigationCommandActive = true;
    try {
      state.setActiveFile(path);
    } finally {
      this.navigationCommandActive = false;
    }
    await this.documentNavigation.navigate(async isCurrent => {
      // Preview work may invalidate a render after its editor session has been
      // created. Navigation owns the completion contract, so retry within this
      // transaction until the requested document is the live editor.
      for (let attempt = 0; attempt < 3 && isCurrent(); attempt += 1) {
        await this.handleSelectionChange(isCurrent);
        if (this.currentFilePath === path && state.current.activeFile === path) return;
      }
      if (isCurrent()) throw new Error(`Unable to activate document: ${path}`);
    });
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
    this.documentSession.focusLine(state.current.activeFile ?? this.currentFilePath, line);
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
      showNotice('The current section could not be saved. Your changes remain open. Reconnect the project and try again before continuing.', 'error');
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
        const renderResult = await this.preview.forceRender(html);
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
      this.preview.currentRevision,
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

}
