import '../style.css';
import { state } from '../state';
import { initSidebar } from '../ui/sidebar';
import { initPageSetupDrawer } from '../ui/page-setup';
import { initTypographyDrawer } from '../ui/typography-setup';
import { initListsDrawer } from '../ui/lists-setup';
import { initProjectMetadataDrawer } from '../ui/project-metadata';
import { EditorManager } from '../ui/editor-manager';
import { renderAppShell } from '../ui/components/AppShell';
import { initializeSymbolPicker } from '../ui/symbolPicker';
import { ProjectService } from '../services/ProjectService';
import { SettingsService } from '../services/SettingsService';
import { initCustomStylesDrawer } from '../ui/custom-styles-setup';
import { initDocumentOutlineDrawer } from '../ui/document-outline';
import { initProjectSearchDrawer } from '../ui/project-search';
import { initProjectReviewDrawer } from '../ui/project-review';
import { initWritingWorkflow } from '../ui/keyboard-shortcuts';
import { registerServiceWorker } from '../sw-registration';
import { setupAppInstallPrompt } from '../pwa-install';
import { setupEditorSettingsDrawer } from '../ui/editor-settings-setup';
import { previewMetrics } from '../perf/preview-metrics';
import { initTablesDrawer } from '../ui/tables-setup';
import { initTocSetupDrawer } from '../ui/toc-setup';
import { initSettingsDrawer } from '../ui/settings-drawer';
import { applyHeadingNumbering } from '../preview/headingNumbering';
import { applyTableOfContents } from '../preview/tableOfContents';
import { resolveImageSource } from '../images/imageSources';
import type { Platform, WorkspaceSession } from '../platform/types';
import { showNotice } from '../ui/components/Notice';
import { describeWorkspaceError } from '../services/project-runtime-feedback';

let editorManager: EditorManager;
type StartupWindow = Window & {
  __CLEAR_WRITER_READY__?: boolean;
};

function shouldRestoreLastWorkspace(): boolean {
  return new URLSearchParams(window.location.search).get('restoreLastWorkspace') === 'true';
}

function setupPreviewDiagnosticsChip() {
  const diagnostics = document.getElementById('preview-diagnostics');
  if (!diagnostics) return;

  const render = () => {
    diagnostics.textContent = previewMetrics.formatChipSummary();
    diagnostics.title = 'Snapshot load time and preview render count';
  };

  render();
  previewMetrics.subscribe(render);
}

async function saveActiveFile(): Promise<boolean> {
  return editorManager.prepareForNavigation();
}

function markExportUnavailable(button: HTMLElement, label: string) {
  button.setAttribute('disabled', 'true');
  button.setAttribute('aria-disabled', 'true');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.dataset.exportStatus = 'unavailable';
}

export async function bootApp(platform: Platform) {
  const appContainer = document.getElementById('app');
  if (appContainer) {
    renderAppShell(appContainer);
  }

  editorManager = new EditorManager(platform);
  // Expose for smoke tests
  (window as any).__CLEAR_WRITER_EDITOR_MANAGER__ = editorManager;
  
  setupPreviewDiagnosticsChip();
  setupAppInstallPrompt();
  initializeSymbolPicker(() => editorManager.getEditorView());
  initSettingsDrawer();

  document.querySelectorAll<HTMLButtonElement>('[data-markdown-command]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const command = button.dataset.markdownCommand;
      if (command) editorManager.applyMarkdownCommand(command as import('../editor/markdown-commands').MarkdownCommand);
    });
  });

  const btnSearch = document.getElementById('btn-open-search');
  if (btnSearch) {
    btnSearch.addEventListener('click', () => {
      const editorView = editorManager.getEditorView();
      if (editorView) {
        editorView.openSearchPanel();
      }
    });
  }

  initSidebar(platform, async (session) => {
    await ProjectService.loadProjectSnapshot(session);
  }, saveActiveFile, (text) => editorManager.insertTextAtCursor(text));

  async function saveSettingsWithNotice(operation: (session: WorkspaceSession) => Promise<void>) {
    try {
      const session = await platform.workspaceRepository.open(state.get.projectRef!);
      await operation(session);
    } catch (error) {
      console.error('Settings were not saved:', error);
      showNotice(describeWorkspaceError(error, 'settings'), 'error');
      throw error;
    }
  }

  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) {
    if (!platform.exportService.support.pdf) {
      markExportUnavailable(btnExportPdf, 'PDF export is unavailable in this runtime');
    } else {
    const setExportStatus = (status: 'idle' | 'preparing' | 'exporting' | 'exported' | 'failed') => {
      const labels = {
        idle: 'Export PDF',
        preparing: 'Preparing PDF…',
        exporting: 'Exporting PDF…',
        exported: 'PDF exported',
        failed: 'PDF export failed'
      };
      btnExportPdf.dataset.exportStatus = status;
      btnExportPdf.setAttribute('aria-label', labels[status]);
      btnExportPdf.title = labels[status];
      if (status === 'exporting') btnExportPdf.setAttribute('aria-busy', 'true');
      else btnExportPdf.removeAttribute('aria-busy');
    };

    btnExportPdf.addEventListener('click', async () => {
      btnExportPdf.setAttribute('disabled', 'true');
      setExportStatus('preparing');
      const exportWindow = platform.exportService.preparePdfExport?.();
      if (platform.exportService.preparePdfExport && !exportWindow) {
        setExportStatus('failed');
        showNotice('PDF export could not open its save window. Allow popups for Clear Writer and try again.', 'error');
        btnExportPdf.removeAttribute('disabled');
        return;
      }
      try {
        const exportDocument = await editorManager.compilePaginatedExportSnapshot();
        setExportStatus('exporting');
        const success = await platform.exportService.exportPdf(
          exportDocument.html,
          exportDocument.pageSetup,
          state.get.typographySetup,
          state.get.listSetup,
          state.get.tableSetup,
          state.get.projectMetadata,
          state.get.projectRef ? state.get.projectRef.id : null,
          exportWindow
        );
        if (success) {
          setExportStatus('exported');
        } else {
          if (exportWindow && !exportWindow.closed) exportWindow.close();
          setExportStatus('failed');
          showNotice('PDF export was not completed. The document remains open and unchanged.', 'error');
        }
      } catch (error) {
        console.error('PDF export failed', error);
        if (exportWindow && !exportWindow.closed) exportWindow.close();
        setExportStatus('failed');
        showNotice('PDF export failed. The document remains open and unchanged.', 'error');
      } finally {
        setTimeout(() => {
          setExportStatus('idle');
          btnExportPdf.removeAttribute('disabled');
        }, 3000);
      }
    });
    }
  }

  const btnExportDocx = document.getElementById('btn-export-docx');
  if (btnExportDocx) {
    if (!platform.exportService.support.docx) {
      markExportUnavailable(btnExportDocx, 'Word export is planned for Release 2');
    } else {
    const setExportStatus = (status: 'idle' | 'exporting' | 'exported' | 'failed') => {
      const labels = {
        idle: 'Export Word',
        exporting: 'Exporting Word…',
        exported: 'Word exported',
        failed: 'Word export failed'
      };
      btnExportDocx.dataset.exportStatus = status;
      btnExportDocx.setAttribute('aria-label', labels[status]);
      btnExportDocx.title = labels[status];
      if (status === 'exporting') btnExportDocx.setAttribute('aria-busy', 'true');
      else btnExportDocx.removeAttribute('aria-busy');
    };

    btnExportDocx.addEventListener('click', async () => {
      btnExportDocx.setAttribute('disabled', 'true');
      setExportStatus('exporting');
      try {
        const exportHtml = await editorManager.compileExportSnapshot();
        const { generateDocx } = await import('../services/ExportDocxService');
        
        const dependencies = {
          parseHtml: (htmlStr: string) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlStr, 'text/html');
            
            // Run preview-time transforms on the parsed DOM structure
            applyHeadingNumbering(doc.body);
            applyTableOfContents(doc.body, state.get.pageSetup.toc?.maxLevel);
            
            return doc.body;
          },
          fetchImage: async (src: string) => {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.arrayBuffer();
          },
          getImageDimensions: (src: string) => {
            return new Promise<{ width: number; height: number }>((resolve) => {
              const tempImg = new Image();
              tempImg.onload = () => {
                resolve({ width: tempImg.naturalWidth, height: tempImg.naturalHeight });
              };
              tempImg.onerror = () => {
                resolve({ width: 200, height: 100 });
              };
              tempImg.src = src;
            });
          },
          resolveImageSource: (src: string) => resolveImageSource(src, platform.assetResolver)
        };

        const docxBuffer = await generateDocx(
          exportHtml,
          state.get.pageSetup,
          state.get.typographySetup,
          state.get.listSetup,
          state.get.tableSetup,
          state.get.projectMetadata,
          dependencies
        );

        const result = await platform.exportService.saveDocx(new Uint8Array(docxBuffer), 'document.docx');
        if (result && result.status === 'saved') {
          setExportStatus('exported');
        } else if (result && result.status === 'cancelled') {
          setExportStatus('idle');
          btnExportDocx.removeAttribute('disabled');
          return;
        } else {
          setExportStatus('failed');
        }
      } catch (error) {
        console.error('Word export failed', error);
        setExportStatus('failed');
      } finally {
        setTimeout(() => {
          setExportStatus('idle');
          btnExportDocx.removeAttribute('disabled');
        }, 3000);
      }
    });
    }
  }

  platform.appLifecycle.onBeforeClose(async () => {
    try {
      await editorManager.flushCurrentDocument();
      platform.appLifecycle.confirmClose(true);
    } catch (error) {
      console.error('Unable to save before closing:', error);
      showNotice(describeWorkspaceError(error, 'close'), 'error');
      platform.appLifecycle.confirmClose(false, error instanceof Error ? error.message : String(error));
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (editorManager.hasUnsavedChanges() || editorManager.isSaveInFlight()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  initWritingWorkflow(editorManager);

  initPageSetupDrawer(async (pageSetup) => {
    await saveSettingsWithNotice((session) => SettingsService.saveSettings(session, pageSetup));
  });

  initTocSetupDrawer(async (pageSetup) => {
    await saveSettingsWithNotice((session) => SettingsService.saveSettings(session, pageSetup));
  });
  
  initTypographyDrawer(async (typographySetup) => {
    await saveSettingsWithNotice((session) => SettingsService.saveSettings(session, undefined, typographySetup));
  });

  initListsDrawer(async (listSetup) => {
    await saveSettingsWithNotice((session) => SettingsService.saveSettings(session, undefined, undefined, listSetup));
  });

  initTablesDrawer(async (tableSetup) => {
    await saveSettingsWithNotice((session) => SettingsService.saveSettings(
      session, undefined, undefined, undefined, undefined, undefined, undefined, tableSetup
    ));
  });

  initProjectMetadataDrawer(async (projectMetadata) => {
    await saveSettingsWithNotice((session) => SettingsService.saveSettings(session, undefined, undefined, undefined, projectMetadata));
  });

  initCustomStylesDrawer(platform, async (customStyles) => {
    await saveSettingsWithNotice((session) => SettingsService.saveSettings(session, undefined, undefined, undefined, undefined, customStyles));
  });

  setupEditorSettingsDrawer();
  initDocumentOutlineDrawer(platform, editorManager);
  initProjectSearchDrawer(platform, editorManager);
  initProjectReviewDrawer(platform, editorManager);

  let projectRef = state.current.projectRef;
  if (!projectRef && shouldRestoreLastWorkspace() && platform.workspaceRepository.getLastOpenedWorkspace) {
    try {
      projectRef = await platform.workspaceRepository.getLastOpenedWorkspace();
      if (projectRef) {
        state.setProjectRef(projectRef);
      }
    } catch (error) {
      console.warn('Failed to restore last-opened browser project', error);
    }
  }

  if (projectRef) {
    const session = await platform.workspaceRepository.open(projectRef);
    await ProjectService.loadProjectSnapshot(session);
  } else {
    editorManager.renderEmptyWorkspace();
  }

  (window as StartupWindow).__CLEAR_WRITER_READY__ = true;
  registerServiceWorker();
}
