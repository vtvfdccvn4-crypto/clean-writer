import { state } from '../state';
import { createEditor, DraftRecoveryStore } from '../editor';
import { extractWritingStatistics } from '../editor/writing-statistics';
import type { MarkdownEditor } from '../editor';
import { compileMarkdown } from '../compiler';
import { compileExportSnapshot as compileSnapshot } from '../services/ExportSnapshotService';
import { renderDocumentSection } from '../preview/document-rendering';
import type { Platform, PdfExportDocument } from '../platform/types';
import { showNotice } from './components/Notice';
import { showConfirmDialog } from './confirm-dialog';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { applyMarkdownCommand, type MarkdownCommand } from '../editor/markdown-commands';
import { PreviewCoordinator } from './PreviewCoordinator';
import { DocumentSessionController } from './DocumentSessionController';
import { EditorStatusController, type EditorSaveStatus } from './EditorStatusController';
import { EditorSaveCoordinator } from './EditorSaveCoordinator';
import { DocumentActivationCoordinator } from './DocumentActivationCoordinator';
import { WelcomeController } from './WelcomeController';
import { AppScreenController } from './AppScreenController';
import { ExportOrchestrationController } from './ExportOrchestrationController';
import { BackgroundExportPaginator } from './BackgroundExportPaginator';
import { importPastedImage } from '../images/importPastedImage';
import { parseMarkdownImages } from '../images/markdownImages';
import { resolveMarginContent } from '../preview/CssGenerator';

export class EditorManager {
  private preview: PreviewCoordinator;
  private editorContainer: HTMLElement;
  private pagedStage: HTMLElement;
  private previewPane: HTMLElement;
  private statsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly documentSession = new DocumentSessionController();
  private readonly activation: DocumentActivationCoordinator;
  private readonly welcome: WelcomeController;
  private readonly screens: AppScreenController;
  private platform: Platform;
  private readonly exportOrchestration: ExportOrchestrationController;
  private readonly backgroundExportPaginator: BackgroundExportPaginator;
  private readonly statusController = new EditorStatusController();
  private readonly saveCoordinator: EditorSaveCoordinator;

  constructor(platform: Platform) {
    this.platform = platform;
    this.editorContainer = document.getElementById('editor-container')!;
    this.pagedStage = document.getElementById('paged-stage')!;
    this.previewPane = document.querySelector('.preview-pane')!;
    this.preview = new PreviewCoordinator(this.pagedStage, this.platform.assetResolver);
    this.backgroundExportPaginator = new BackgroundExportPaginator();
    const welcomeScreen = document.getElementById('welcome-screen-root')!;
    this.welcome = new WelcomeController({
      welcomeContainer: welcomeScreen,
      workspaceRepository: this.platform.workspaceRepository
    });
    this.screens = new AppScreenController({
      welcomeScreen,
      workspaceScreen: document.querySelector<HTMLElement>('.workspace-shell')!,
      workspaceStatusBar: document.querySelector<HTMLElement>('.workspace-status-bar')!
    });
    this.exportOrchestration = new ExportOrchestrationController({
      compileSnapshot: () => this.compileExportSnapshot(),
      paginateInBackground: async html => {
        const paginated = await this.backgroundExportPaginator.paginate({
          html,
          pageSetup: state.current.pageSetup,
          typographySetup: state.current.typographySetup,
          listSetup: state.current.listSetup,
          tableSetup: state.current.tableSetup,
          resolvedMarginImageSources: collectResolvedMarginImageSources(
            state.current.pageSetup,
            this.platform.assetResolver
          )
        });
        return {
          ...paginated,
          error: paginated.error ? new Error(paginated.error) : undefined
        };
      },
      getPageSetup: () => state.current.pageSetup
    });
    this.activation = new DocumentActivationCoordinator({
      flushCurrentDocument: () => this.flushCurrentDocument(),
      setActiveFile: path => state.setActiveFile(path),
      activate: isLatest => this.handleSelectionChange(isLatest),
      reportError: (reason, error) => this.reportWorkflowError(`Unable to complete ${reason}.`, error),
      isCurrentDocument: path => this.currentFilePath === path && state.current.activeFile === path
    });
    this.saveCoordinator = new EditorSaveCoordinator({
      getEditor: () => this.currentEditorView,
      updateStatus: status => this.updateSaveStatus(status),
      reportError: error => console.error('[EditorManager] Save failed.', error),
      reportNavigationBlocked: () => showNotice('The current section could not be saved. Your changes remain open. Reconnect the project and try again before continuing.', 'error')
    });
    this.setPreviewVisible(Boolean(state.current.projectRef));

    state.onEditorSetupChanged(() => {
      this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);
    });
    this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);

    // Bind state events
    state.onSelectionChanged(() => {
      if (this.activation.isNavigationCommandActive()) return;
      this.activation.request('selection change');
    });
    state.onProjectChanged(() => {
      this.setPreviewVisible(Boolean(state.current.projectRef));
    });
    state.onProjectSnapshotChanged(() => {
      this.applySnapshotSettings();
      this.setPreviewVisible(Boolean(state.current.projectRef));
      this.activation.request('project snapshot change');
    });
    state.onProjectTreeChanged(() => {
      this.activation.request('project tree change');
    });
    state.onSettingsSnapshotChanged(() => {
      this.applySnapshotSettings();
      this.activation.request('settings snapshot change');
    });
    state.onPageSetupChanged(() => {
      this.preview.applyPageSetup(state.current.pageSetup);
      this.applyDocumentContentWidth();
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
      this.activation.request('project metadata change');
    });

    // Apply initial defaults
    this.preview.applyPageSetup(state.current.pageSetup);
    this.applyDocumentContentWidth();
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
    this.applyDocumentContentWidth();
  }

  /** Keep inline editor images within the final document's printable width. */
  private applyDocumentContentWidth(): void {
    const { paperWidth, marginLeft, marginRight } = state.current.pageSetup;
    const width = Math.max(0, paperWidth - marginLeft - marginRight);
    this.editorContainer.style.setProperty('--document-content-width', `${width}mm`);
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

    this.welcome.destroy();
    this.screens.showWorkspace();
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
    this.screens.showWelcome();
    this.welcome.render();

    this.preview.clear();
  }

  private setPreviewVisible(visible: boolean) {
    this.previewPane.classList.toggle('is-project-closed', !visible);
    this.previewPane.setAttribute('aria-hidden', String(!visible));
  }

  private async renderFullDocument(isLatest: () => boolean) {
    const revision = this.preview.beginRevision();
    this.preview.clearVisiblePreview();
    const { projectRef } = state.current;
    if (!projectRef) throw new Error('No project is open.');
    
    // Cleanup old editor
    this.documentSession.destroyActive();
    this.updateSaveStatus('idle');
    this.updateActiveSectionLabel('Full Document', 'Full Document Mode');
    this.documentSession.clearPendingFocus();
    
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
          let saved = await session.writeSection(filename, newDoc);
          if (!saved) {
            const refreshedSession = await this.platform.workspaceRepository.open(projectRef);
            saved = await refreshedSession.writeSection(filename, newDoc);
          }
          if (!saved) throw new Error(`Workspace rejected writes for ${filename}.`);

          // Compilation and session updates are asynchronous. Only the newest edit may
          // update the preview if several callbacks complete out of order.
          if (!this.preview.isCurrent(changeRevision)
            || this.currentFilePath !== filename
            || state.current.activeFile !== filename) return;

          DraftRecoveryStore.clearDraft(projectRef.id, filename);
          DraftRecoveryStore.markSaved(projectRef.id, filename);
          this.updateSaveStatus('saved');
          this.notifyProjectStatsChanged();

          try {
            const compiledPreview = await this.preview.compileDocument(markdownToCompile, 'single-document-edit');
            if (!this.preview.isCurrent(changeRevision)
              || this.currentFilePath !== filename
              || state.current.activeFile !== filename) return;
            // Two-Lane engine
            this.preview.publish(compiledPreview, changeRevision);
          } catch (previewError) {
            console.warn(`[EditorManager] Preview refresh failed for ${filename}.`, previewError);
          }
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
      },
      resolveImageSource: async (source: string) => {
        await this.platform.assetResolver.preloadImages([source]);
        return this.platform.assetResolver.resolveSync(source);
      },
      onImageFile: async (file: File) => {
        try {
          return await importPastedImage(session, file, filename, this.platform.assetResolver, state.current.imageSetup);
        } catch (error) {
          console.error('[EditorManager] Failed to import pasted image.', error);
          showNotice('The pasted image could not be added to this project.', 'error');
          return null;
        }
      }
    };

    this.documentSession.activate(projectRef, filename, createEditor(this.editorContainer, content, callbacks));
    // Apply outline/search navigation before the new editor can first paint at line 1.
    const focusedPendingLine = this.documentSession.applyPendingFocus(filename);

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
    if (!focusedPendingLine) {
      await this.documentSession.restoreViewState(projectRef, filename);
    }
    this.updateSaveStatus('saved');
  }

  public getEditorView() {
    return this.currentEditorView;
  }

  /**
   * Resolves when the requested document activation has completed its editor,
   * preview, and view-state restoration phases.
   */
  public async whenDocumentReady(path: string): Promise<void> {
    await this.activation.whenReady(path);
    if (!this.currentEditorView) throw new Error(`Editor is not available for ${path}.`);
  }

  /** Selects a document and resolves after the corresponding editor render settles. */
  public async openDocument(path: string): Promise<void> {
    if (this.currentFilePath === path && state.current.activeFile === path) return;
    // Persist under the current file identity before publishing the next one.
    // The autosave callback intentionally rejects writes once selection changes.
    await this.activation.openDocument(path);
  }

  /** Opens a document only when needed, then places the requested line at the top. */
  public async navigateToLine(path: string, line: number): Promise<void> {
    if (this.currentFilePath === path && state.current.activeFile === path) {
      this.documentSession.focusLine(path, line);
      return;
    }

    this.documentSession.focusLine(path, line);
    try {
      await this.activation.openDocument(path);
    } catch (error) {
      this.documentSession.clearPendingFocus();
      throw error;
    }
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
    return this.saveCoordinator.hasUnsavedChanges();
  }

  public isSaveInFlight(): boolean {
    return this.saveCoordinator.isSaveInFlight();
  }

  public async prepareForNavigation(): Promise<boolean> {
    return this.saveCoordinator.prepareForNavigation();
  }

  public async flushCurrentDocument(): Promise<void> {
    return this.saveCoordinator.flushCurrentDocument();
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
    return this.exportOrchestration.compilePaginatedSnapshot();
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
    const wordCount = document.getElementById('workspace-word-count');
    const lineCount = document.getElementById('workspace-line-count');
    if (!wordCount || !lineCount) return;
    
    if (markdown === null) {
      wordCount.textContent = '0 words';
      lineCount.textContent = '0 lines';
      return;
    }

    const stats = extractWritingStatistics(markdown);
    wordCount.textContent = `${stats.words.toLocaleString()} words`;
    lineCount.textContent = `${markdown ? markdown.split(/\r?\n/).length : 0} lines`;
  }

  private updateSaveStatus(status: EditorSaveStatus) {
    this.statusController.setStatus(status);
  }

}

function collectResolvedMarginImageSources(
  pageSetup: typeof state.current.pageSetup,
  assetResolver: Platform['assetResolver']
): Record<string, string> {
  const resolved: Record<string, string> = {};
  const cells = [
    pageSetup.header?.left,
    pageSetup.header?.center,
    pageSetup.header?.right,
    pageSetup.footer?.left,
    pageSetup.footer?.center,
    pageSetup.footer?.right
  ];

  for (const cell of cells) {
    if (!cell?.content) continue;
    const content = resolveMarginContent(cell.content, 1);
    for (const image of parseMarkdownImages(content)) {
      if (resolved[image.source]) continue;
      resolved[image.source] = assetResolver.resolveSync(image.source);
    }
  }

  return resolved;
}
