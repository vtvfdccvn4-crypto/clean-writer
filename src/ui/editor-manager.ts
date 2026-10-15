import { state } from '../state';
import { extractWritingStatistics } from '../editor/writing-statistics';
import type { MarkdownEditor } from '../editor';
import { compileMarkdown } from '../compiler';
import { compileExportSnapshot as compileSnapshot } from '../services/ExportSnapshotService';
import type { Platform } from '../platform/types';
import { showNotice } from './components/Notice';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { applyMarkdownCommand, type MarkdownCommand } from '../editor/markdown-commands';
import { PreviewCoordinator } from './PreviewCoordinator';
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
import { PageGuideCoordinator, type PageGuideComputation, type PageGuideSnapshot } from './PageGuideCoordinator';
import { createWelcomeProjectActions } from './WelcomeProjectActions';
import { projectSession } from '../services/ProjectSessionStore';
import { IsolatedPaginationHost } from '../pdf-preview/IsolatedPaginationHost';
import { renderDocumentSection } from '../preview/document-rendering';
import { DocumentRenderCoordinator } from './DocumentRenderCoordinator';

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
  /** The selected document stays in the user-selected preview mode while editing. */
  private isFinalPrintPreview = true;
  private readonly pageGuides: PageGuideCoordinator;
  private pageGuideLayoutRevision = 0;
  /** The screen currently on display, so screen syncs stay idempotent. */
  private renderedScreen: 'welcome' | 'workspace' | null = null;
  private readonly isolatedPaginationHost = new IsolatedPaginationHost();
  private readonly renderCoordinator: DocumentRenderCoordinator;

  constructor(platform: Platform) {
    this.platform = platform;
    this.editorContainer = document.getElementById('editor-container')!;
    this.pagedStage = document.getElementById('paged-stage')!;
    this.previewPane = document.getElementById('preview-panel')!;
    this.preview = new PreviewCoordinator(
      this.pagedStage,
      this.platform.assetResolver,
      line => this.focusPreviewSourceLine(line),
      target => this.focusPreviewSourceTarget(target),
      (sourceHtml, pageSetup) => createPdfPreviewJob(sourceHtml, this.renderCoordinator.capturePrintLayout(pageSetup), this.platform.assetResolver),
      this.isolatedPaginationHost
    );
    this.pageGuides = new PageGuideCoordinator({
      getSnapshot: () => this.getPageGuideSnapshot(),
      compute: (snapshot, signal) => this.computePageGuides(snapshot, signal),
      isCurrent: snapshot => this.isCurrentPageGuideSnapshot(snapshot),
      apply: guides => this.preview.setCanonicalPageBreakGuides(guides)
    });
    this.renderCoordinator = new DocumentRenderCoordinator({
      preview: this.preview,
      platform: this.platform,
      documentSession: this.documentSession,
      pageGuides: this.pageGuides,
      editorContainer: this.editorContainer,
      getIsFinalPrintPreview: () => this.isFinalPrintPreview,
      getIsSupressingPreviewNavigation: () => this.suppressPreviewSelectionNavigation,
      scheduleCanonicalPageBreakGuides: () => this.scheduleCanonicalPageBreakGuides(),
      syncFinalPrintPreviewToggle: () => this.syncFinalPrintPreviewToggle(),
      updateSaveStatus: status => this.updateSaveStatus(status),
      updateActiveSectionLabel: (filename, customLabel) => this.updateActiveSectionLabel(filename, customLabel),
      reportWorkflowError: (message, error) => this.reportWorkflowError(message, error),
      updateSectionStats: markdown => this.updateSectionStats(markdown)
    });
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
      this.isFinalPrintPreview = true;
      this.clearCanonicalPageBreakGuides();
      this.syncFinalPrintPreviewToggle();
      if (this.activation.isNavigationCommandActive()) return;
      this.activation.request('selection change');
    });
    state.onProjectChanged(() => {
      this.clearCanonicalPageBreakGuides();
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
    state.onPageSetupChanged(() => {
      this.preview.applyPageSetup(state.current.pageSetup, false);
      this.preview.schedulePaginatedRefresh();
      this.applyDocumentContentWidth();
      this.scheduleCanonicalPageBreakGuides(true);
    });
    state.onTypographySetupChanged(() => {
      this.preview.applyTypographySetup(state.current.typographySetup);
      this.preview.schedulePaginatedRefresh();
      this.scheduleCanonicalPageBreakGuides(true);
    });
    state.onListSetupChanged(() => {
      this.preview.applyListSetup(state.current.listSetup);
      this.preview.schedulePaginatedRefresh();
      this.scheduleCanonicalPageBreakGuides(true);
    });
    state.onTableSetupChanged(() => {
      this.preview.applyTableSetup(state.current.tableSetup);
      this.preview.schedulePaginatedRefresh();
      this.scheduleCanonicalPageBreakGuides(true);
    });
    state.onImageSetupChanged(() => {
      this.preview.applyImageSetup(state.current.imageSetup);
      this.preview.schedulePaginatedRefresh();
      this.scheduleCanonicalPageBreakGuides(true);
    });
    state.onProjectMetadataChanged(() => {
      this.scheduleCanonicalPageBreakGuides(true);
      this.activation.request('project metadata change');
    });
    state.onCustomStylesChanged(() => {
      this.preview.schedulePaginatedRefresh();
      this.scheduleCanonicalPageBreakGuides(true);
    });
    state.onCustomBlockStylesChanged(() => {
      this.preview.schedulePaginatedRefresh();
      this.scheduleCanonicalPageBreakGuides(true);
    });

    // Apply initial defaults
    this.preview.applyPageSetup(state.current.pageSetup);
    this.applyDocumentContentWidth();
    this.preview.applyTypographySetup(state.current.typographySetup);
    this.preview.applyListSetup(state.current.listSetup);
    this.preview.applyTableSetup(state.current.tableSetup);
    this.preview.applyImageSetup(state.current.imageSetup);
    this.syncFinalPrintPreviewToggle();
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
    this.preview.applyImageSetup(state.current.imageSetup);
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
      this.isFinalPrintPreview = true;
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
    this.clearCanonicalPageBreakGuides();
    this.preview.beginRevision();
    this.updateSaveStatus('idle');
    this.updateActiveSectionLabel(null);
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
  public async toggleFinalPrintPreview(): Promise<void> {
    const { projectRef, activeFile, sections } = state.current;
    const editor = this.currentEditorView;
    if (!projectRef || !activeFile || !editor) return;

    await this.flushCurrentDocument();
    const visiblePaginatedGuides = this.isFinalPrintPreview
      ? this.preview.getPaginatedPageBreakGuides()
      : [];
    this.isFinalPrintPreview = !this.isFinalPrintPreview;
    this.syncFinalPrintPreviewToggle();
    if (this.isFinalPrintPreview) this.clearCanonicalPageBreakGuides();

    const revision = this.preview.beginRevision();
    this.preview.setMode(this.isFinalPrintPreview ? 'paginated' : 'live');
    this.preview.clearVisiblePreview();
    const markdown = renderDocumentSection({ path: activeFile, markdown: editor.getValue() }, sections, 0);
    const compiled = await this.preview.compileDocument(markdown, 'single-document-load');
    if (!this.preview.isCurrent(revision)
      || state.current.activeFile !== activeFile
      || !this.currentEditorView) return;
    if (this.isFinalPrintPreview) {
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
    if (!this.isFinalPrintPreview) {
      if (visiblePaginatedGuides.length > 0) this.preview.setCanonicalPageBreakGuides(visiblePaginatedGuides);
      this.scheduleCanonicalPageBreakGuides();
    }
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
    const session = await this.platform.workspaceRepository.open(projectRef);
    return compileSnapshot({
      session,
      assetResolver: this.platform.assetResolver,
      isFullDocMode,
      activeFile,
      sections,
      signal,
      currentMarkdown: this.currentFilePath === activeFile && this.currentEditorView
        ? this.currentEditorView.getValue()
        : undefined
    }, {
      compile: compileMarkdown
    });
  }

  /** Builds input for the isolated PDF preview pipeline. */
  public async compilePdfPreviewInput(signal?: AbortSignal): Promise<PdfPreviewJob> {
    const html = await this.compileExportSnapshot(signal);
    const layout = this.renderCoordinator.capturePrintLayout();
    return createPdfPreviewJob(html, layout, this.platform.assetResolver);
  }

  /** A matching paginated preview is already the final PDF rendering product. */
  public getPreparedPdfArtifact(input: PdfPreviewJob): PdfArtifact | null {
    return this.preview.getPdfArtifact(input.key);
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

  private syncFinalPrintPreviewToggle(): void {
    const button = document.getElementById('btn-toggle-print-preview');
    if (!(button instanceof HTMLButtonElement)) return;
    const isShowingFinalPreview = !state.current.isFullDocMode && this.isFinalPrintPreview;
    button.setAttribute('aria-pressed', String(isShowingFinalPreview));
    button.setAttribute('aria-label', isShowingFinalPreview ? 'Return to canonical editor' : 'Show final print preview');
    button.title = isShowingFinalPreview ? 'Return to canonical editor' : 'Show final print preview';
  }

  private clearCanonicalPageBreakGuides(): void {
    this.pageGuides.clear();
  }

  /** Debounces an isolated print-layout pass without delaying editor feedback. */
  private scheduleCanonicalPageBreakGuides(layoutChanged = false): void {
    if (layoutChanged) this.pageGuideLayoutRevision += 1;
    if (!this.isFinalPrintPreview) this.pageGuides.schedule(layoutChanged ? 'layout' : 'typing');
  }

  private getPageGuideSnapshot(): PageGuideSnapshot | null {
    const editor = this.currentEditorView;
    const { projectRef, activeFile } = state.current;
    if (!editor || !projectRef || !activeFile || this.isFinalPrintPreview) return null;
    return {
      projectId: projectRef.id,
      documentPath: activeFile,
      markdown: editor.getValue(),
      layoutRevision: this.pageGuideLayoutRevision
    };
  }

  private async computePageGuides(snapshot: PageGuideSnapshot, signal: AbortSignal): Promise<PageGuideComputation> {
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
      console.warn('[EditorManager] Canonical page-guide refresh failed.', error);
      return { status: 'failed', guides: [] };
    }
  }

  private isCurrentPageGuideSnapshot(snapshot: PageGuideSnapshot): boolean {
    return !this.isFinalPrintPreview
      && state.current.projectRef?.id === snapshot.projectId
      && state.current.activeFile === snapshot.documentPath
      && this.currentFilePath === snapshot.documentPath
      && this.currentEditorView?.getValue() === snapshot.markdown
      && this.pageGuideLayoutRevision === snapshot.layoutRevision;
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
