import { state } from '../state';
import type { MarkdownEditor } from '../editor';
import { compileMarkdown, documentCompileSettings } from '../compiler';
import { compileExportSnapshot as compileSnapshot } from '../services/ExportSnapshotService';
import type { Platform } from '../platform/types';
import { showNotice } from './components/Notice';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { applyMarkdownCommand, type MarkdownCommand } from '../editor/markdown-commands';
import type { PreviewCoordinator } from './PreviewCoordinator';
import { DocumentSessionController } from './DocumentSessionController';
import { EditorStatusController, type EditorSaveStatus } from './EditorStatusController';
import { EditorSaveCoordinator } from './EditorSaveCoordinator';
import { DocumentActivationCoordinator } from './DocumentActivationCoordinator';
import { WelcomeController } from './WelcomeController';
import { AppScreenController } from './AppScreenController';
import { createPdfPreviewJob } from '../pdf-preview/PdfPreviewJobFactory';
import type { PdfPreviewJob } from '../pdf-preview/contracts';
import type { PdfArtifact } from '../pdf-preview/PdfArtifact';
import type { CommittedPreviewTarget } from '../preview/navigation/CommittedPreviewIndex';
import { createWelcomeProjectActions } from './WelcomeProjectActions';
import { projectSession } from '../services/ProjectSessionStore';
import type { DocumentRenderCoordinator } from './DocumentRenderCoordinator';
import type { PaginatedPreviewRenderer } from './PaginatedPreviewRenderer';
import { PreviewPipeline } from './PreviewPipeline';
import type { IsolatedPaginationHost } from '../pdf-preview/IsolatedPaginationHost';
import { captureCurrentPrintLayout } from './CompiledPreviewCache';

export class EditorManager {
  private preview: PreviewCoordinator;
  private editorContainer: HTMLElement;
  private pagedStage: HTMLElement;
  private previewPane: HTMLElement;
  private readonly documentSession = new DocumentSessionController(
    available => this.syncMarkdownToolbarAvailability(available)
  );
  private readonly activation: DocumentActivationCoordinator;
  private readonly welcome: WelcomeController;
  private readonly screens: AppScreenController;
  private platform: Platform;
  private readonly statusController = new EditorStatusController();
  private readonly saveCoordinator: EditorSaveCoordinator;
  private suppressPreviewSelectionNavigation = false;
  /** The screen currently on display, so screen syncs stay idempotent. */
  private renderedScreen: 'welcome' | 'workspace' | null = null;
  private readonly renderCoordinator: DocumentRenderCoordinator;
  private readonly paginatedRenderer: PaginatedPreviewRenderer;
  private readonly paginationHost: IsolatedPaginationHost;

  constructor(platform: Platform) {
    this.platform = platform;
    this.editorContainer = document.getElementById('editor-container')!;
    this.pagedStage = document.getElementById('paged-stage')!;
    this.previewPane = document.getElementById('preview-panel')!;
    const pipeline = new PreviewPipeline({
      platform: this.platform,
      documentSession: this.documentSession,
      pagedStage: this.pagedStage,
      editorContainer: this.editorContainer,
      focusPreviewSourceLine: line => this.focusPreviewSourceLine(line),
      focusPreviewSourceTarget: target => this.focusPreviewSourceTarget(target),
      flushCurrentDocument: () => this.flushCurrentDocument(),
      getIsSuppressingPreviewNavigation: () => this.suppressPreviewSelectionNavigation,
      updateSaveStatus: status => this.updateSaveStatus(status),
      updateActiveSectionLabel: (filename, customLabel) => this.statusController.setActiveSection(filename, customLabel),
      reportWorkflowError: (message, error) => this.reportWorkflowError(message, error),
      updateSectionStats: markdown => this.statusController.setSectionStats(markdown),
      updateCaretStatus: status => this.statusController.setCaretStatus(status)
    });
    this.preview = pipeline.preview;
    this.renderCoordinator = pipeline.renderCoordinator;
    this.paginatedRenderer = pipeline.paginatedRenderer;
    this.paginationHost = pipeline.isolatedPaginationHost;
    const welcomeScreen = document.getElementById('welcome-screen-root')!;
    this.welcome = new WelcomeController({
      welcomeContainer: welcomeScreen,
      workspaceRepository: this.platform.workspaceRepository,
      ...createWelcomeProjectActions(this.platform)
    });
    this.screens = new AppScreenController({
      welcomeScreen,
      workspaceScreen: document.querySelector<HTMLElement>('.workspace-shell')!,
      workspaceStatusBar: document.querySelector<HTMLElement>('.workspace-status-bar')!
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
    this.setPreviewVisible(projectSession.isProjectPresent());
    // The project lifecycle is the only authority on which screen shows.
    projectSession.onStatusChanged(() => this.syncScreen());

    state.onEditorSetupChanged(() => {
      this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);
    });
    this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);

    // Bind state events
    state.onSelectionChanged(() => {
      // The print-form toggle applies only to the document that was open when
      // it was invoked; opening a different document returns to its canonical view.
      this.paginatedRenderer.setActive(true);
      this.paginatedRenderer.clearGuides();
      this.paginatedRenderer.syncToggle();
      if (this.activation.isNavigationCommandActive()) return;
      this.activation.request('selection change');
    });
    state.onProjectChanged(() => {
      this.paginatedRenderer.clearGuides();
      // The warm pagination frame belongs to an open project: release it on
      // close, and boot it again on open so the first preview stays fast.
      if (state.current.projectRef) this.paginationHost.prewarm();
      else this.paginationHost.dispose();
      this.syncScreen();
    });
    state.onProjectSnapshotChanged(() => {
      this.applySnapshotSettings();
      this.setPreviewVisible(projectSession.isProjectPresent());
      this.activation.request('project snapshot change');
    });
    state.onProjectTreeChanged(() => {
      this.activation.request('project tree change');
    });
    state.onSettingsSnapshotChanged(() => {
      this.applySnapshotSettings();
      this.activation.request('settings snapshot change');
    });
    // Each preview-affecting setting applies itself, then repaginates.
    const previewSettings: Array<[subscribe: (listener: EventListener) => () => void, apply?: () => void]> = [
      [listener => state.onPageSetupChanged(listener), () => {
        this.preview.applyPageSetup(state.current.pageSetup, false);
        this.applyDocumentContentWidth();
      }],
      [listener => state.onTypographySetupChanged(listener), () => this.preview.applyTypographySetup(state.current.typographySetup)],
      [listener => state.onListSetupChanged(listener), () => this.preview.applyListSetup(state.current.listSetup)],
      [listener => state.onTableSetupChanged(listener), () => this.preview.applyTableSetup(state.current.tableSetup)],
      [listener => state.onImageSetupChanged(listener), () => this.preview.applyImageSetup(state.current.imageSetup)],
      [listener => state.onCustomStylesChanged(listener)],
      [listener => state.onCustomBlockStylesChanged(listener)]
    ];
    for (const [subscribe, apply] of previewSettings) {
      subscribe(() => {
        apply?.();
        this.refreshPagination();
      });
    }
    state.onProjectMetadataChanged(() => {
      this.paginatedRenderer.scheduleGuides(true);
      this.activation.request('project metadata change');
    });

    // Apply initial defaults
    this.applyPreviewSetups(true);
    this.paginatedRenderer.syncToggle();
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
    this.applyPreviewSetups(false);
    this.editorContainer.style.setProperty('--editor-font-size', state.current.editorSetup.fontSize);
  }

  /** Push every preview setting from state, plus the editor's matching content width. */
  private applyPreviewSetups(renderCachedDocument: boolean): void {
    const { pageSetup, typographySetup, listSetup, tableSetup, imageSetup } = state.current;
    this.preview.applyPageSetup(pageSetup, renderCachedDocument);
    this.applyDocumentContentWidth();
    this.preview.applyTypographySetup(typographySetup);
    this.preview.applyListSetup(listSetup);
    this.preview.applyTableSetup(tableSetup);
    this.preview.applyImageSetup(imageSetup);
  }

  private refreshPagination(): void {
    this.preview.schedulePaginatedRefresh();
    this.paginatedRenderer.scheduleGuides(true);
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
    this.statusController.setActiveSection(null);
    
    if (!isLatest()) return;
    const { isFullDocMode, activeFile } = state.current;

    if (!projectSession.isProjectPresent()) {
      this.renderEmptyWorkspace();
      return;
    }

    this.syncScreen();

    // A project is present but its snapshot has not been published yet. The
    // activation loading it requests rendering again once it lands.
    if (!state.current.projectRef) return;

    if (isFullDocMode) {
      await this.renderCoordinator.renderFullDocument(isLatest);
    } else if (activeFile) {
      this.paginatedRenderer.setActive(true);
      await this.renderCoordinator.renderSingleDocument(activeFile, isLatest);
    }

  }

  /**
   * Puts the correct screen on display for the current project lifecycle.
   *
   * This is the only code that switches between the welcome screen and the
   * workspace, and it reads the lifecycle rather than being told what to show,
   * so no caller, however stale, can hide a project that is open or opening.
   */
  private syncScreen(): void {
    const target = projectSession.isProjectPresent() ? 'workspace' : 'welcome';
    if (target === this.renderedScreen) return;
    this.renderedScreen = target;

    if (target === 'workspace') {
      this.welcome.destroy();
      this.screens.showWorkspace();
      this.setPreviewVisible(true);
      return;
    }

    this.setPreviewVisible(false);
    this.screens.showWelcome();
    this.welcome.render();
  }

  public renderEmptyWorkspace() {
    // This method is also called by asynchronous startup/activation work. A
    // project may have become present while that work was awaiting storage, so
    // an obsolete empty-state render must neither tear down the live document
    // nor cover the workspace.
    if (projectSession.isProjectPresent()) {
      this.syncScreen();
      return;
    }

    this.syncMarkdownToolbarAvailability(false);
    this.paginatedRenderer.clearGuides();
    this.preview.beginRevision();
    this.updateSaveStatus('idle');
    this.statusController.setActiveSection(null);
    this.documentSession.clearPendingFocus();
    this.documentSession.destroyActive();
    this.renderCoordinator.latestCompiledPreview = null;
    this.syncScreen();

    this.preview.clear();
  }

  private setPreviewVisible(visible: boolean) {
    this.previewPane.classList.toggle('is-project-closed', !visible);
    this.previewPane.setAttribute('aria-hidden', String(!visible));
  }

  public getEditorView() {
    return this.currentEditorView;
  }

  /** Suspend preview-only viewport scaling while a workspace splitter moves. */
  public setPreviewViewportResizeSuspended(suspended: boolean): void {
    this.preview.setViewportResizeSuspended(suspended);
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

  /**
   * The Markdown toolbar sits above the editor pane and stays visible while a
   * project has no open document, where every command is a silent no-op. The
   * buttons ship disabled and only enable while an editor exists.
   */
  private syncMarkdownToolbarAvailability(available: boolean): void {
    document.querySelectorAll<HTMLButtonElement>('[data-markdown-command]').forEach(button => {
      button.disabled = !available;
    });
  }

  public focusLine(line: number): void {
    this.documentSession.focusLine(state.current.activeFile ?? this.currentFilePath, line);
  }

  /** Focuses source from a preview click without echoing the move back to the preview. */
  private focusPreviewSourceLine(line: number): void {
    this.suppressPreviewSelectionNavigation = true;
    try {
      this.focusLine(line);
    } finally {
      this.suppressPreviewSelectionNavigation = false;
    }
  }

  /** Opens the manifest-backed source section when a merged-preview block is clicked. */
  private focusPreviewSourceTarget(target: CommittedPreviewTarget): void {
    const path = target.entry.filePath;
    if (!path) return;
    this.suppressPreviewSelectionNavigation = true;
    void this.navigateToLine(path, target.entry.range.startLine)
      .catch(error => this.reportWorkflowError(`Could not open ${path} from preview.`, error))
      .finally(() => { this.suppressPreviewSelectionNavigation = false; });
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

  /** Switches to the merged document preview from the preview toolbar. */
  public async showFullDocumentPreview(): Promise<void> {
    await this.flushCurrentDocument();
    if (!state.current.projectRef) return;
    state.setFullDocMode();
  }

  /** Toggles the active section's canonical and final paginated preview forms. */
  public toggleFinalPrintPreview(): Promise<void> {
    return this.paginatedRenderer.toggle();
  }

  /** Refresh an open editor after a project-wide source transformation. */
  public replaceCurrentDocument(path: string, markdown: string): void {
    if (this.currentFilePath !== path || !this.currentEditorView) return;
    const selection = this.currentEditorView.getSelection();
    this.currentEditorView.setValue(markdown);
    this.currentEditorView.setSelection(selection.from, selection.to);
  }

  /** Compile a fresh, durable snapshot; never export the preview cache. */
  public async compileExportSnapshot(signal?: AbortSignal): Promise<string> {
    await this.flushCurrentDocument();
    const { projectRef, isFullDocMode, activeFile, sections } = state.current;
    if (!projectRef) throw new Error('No project is open.');
    // Captured with the sections, so the whole export compiles one settings snapshot.
    const compileSettings = documentCompileSettings(state.current);
    const session = await this.platform.workspaceRepository.open(projectRef);
    return compileSnapshot({
      session,
      assetResolver: this.platform.assetResolver,
      isFullDocMode,
      activeFile,
      sections,
      customBlockStyles: compileSettings.customBlockStyles,
      signal,
      currentMarkdown: this.currentFilePath === activeFile && this.currentEditorView
        ? this.currentEditorView.getValue()
        : undefined
    }, {
      compile: (markdown, assetResolver) => compileMarkdown(markdown, assetResolver, compileSettings)
    });
  }

  /** Builds input for the isolated PDF preview pipeline. */
  public async compilePdfPreviewInput(signal?: AbortSignal): Promise<PdfPreviewJob> {
    const html = await this.compileExportSnapshot(signal);
    const layout = captureCurrentPrintLayout();
    return createPdfPreviewJob(html, layout, this.platform.assetResolver);
  }

  /** A matching paginated preview is already the final PDF rendering product. */
  public getPreparedPdfArtifact(input: PdfPreviewJob): PdfArtifact | null {
    return this.preview.getPdfArtifact(input.key);
  }

  private updateSaveStatus(status: EditorSaveStatus) {
    this.statusController.setStatus(status);
  }

}
