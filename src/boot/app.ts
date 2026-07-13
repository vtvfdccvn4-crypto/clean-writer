import '../style.css';
import { state } from '../state';
import { initSidebar } from '../ui/sidebar';
import { EditorManager } from '../ui/editor-manager';
import { renderAppShell } from '../ui/components/AppShell';
import { initializeSymbolPicker } from '../ui/symbolPicker';
import { projectSession } from '../services/ProjectSessionStore';
import { registerServiceWorker } from '../sw-registration';
import { previewMetrics } from '../perf/preview-metrics';
import { initSettingsDrawer } from '../ui/settings-drawer';
import { applyHeadingNumbering } from '../preview/headingNumbering';
import { applySpecialHeadings } from '../preview/specialHeadings';
import { applyTableOfContents } from '../preview/tableOfContents';
import { resolveImageSource } from '../images/imageSources';
import type { Platform } from '../platform/types';
import { showNotice } from '../ui/components/Notice';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { setupSettingsFeatures } from './setupSettingsFeatures';
import { markExportUnavailable, setupPdfExport } from './setupPdfExport';
import { setupEditorControls } from './setupEditorControls';
import { setupAppLifecycle } from './setupAppLifecycle';
import { setupWritingTools, setupWritingWorkflow } from './setupWritingTools';
import { restoreInitialWorkspace } from './restoreInitialWorkspace';

let editorManager: EditorManager;
type StartupWindow = Window & {
  __CLEAR_WRITER_READY__?: boolean;
};

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

export async function bootApp(platform: Platform) {
  const appContainer = document.getElementById('app');
  if (appContainer) {
    renderAppShell(appContainer);
  }

  editorManager = new EditorManager(platform);
  // Expose for smoke tests
  (window as any).__CLEAR_WRITER_EDITOR_MANAGER__ = editorManager;
  
  setupPreviewDiagnosticsChip();
  initializeSymbolPicker(() => editorManager.getEditorView());
  initSettingsDrawer();

  setupEditorControls(editorManager);

  initSidebar(
    platform,
    (ref, session) => projectSession.activate(ref, session),
    () => projectSession.close(),
    saveActiveFile,
    (text) => editorManager.insertTextAtCursor(text)
  );

  async function saveSettingsWithNotice(patch: import('../types').ProjectSettingsPatch) {
    try {
      await projectSession.updateSettings(patch);
    } catch (error) {
      console.error('Settings were not saved:', error);
      showNotice(describeWorkspaceError(error, 'settings'), 'error');
      throw error;
    }
  }

  setupPdfExport(platform, editorManager);

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
            applySpecialHeadings(doc.body);
            applyTableOfContents(doc.body, state.current.pageSetup.toc?.maxLevel);
            
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
          state.current.pageSetup,
          state.current.typographySetup,
          state.current.listSetup,
          state.current.tableSetup,
          state.current.projectMetadata,
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

  setupAppLifecycle(platform, editorManager);

  setupWritingWorkflow(editorManager);
  setupSettingsFeatures(platform, saveSettingsWithNotice);
  setupWritingTools(platform, editorManager);

  await restoreInitialWorkspace(platform, editorManager);

  (window as StartupWindow).__CLEAR_WRITER_READY__ = true;
  registerServiceWorker();
}
