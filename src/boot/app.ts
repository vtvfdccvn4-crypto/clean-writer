import '../style.css';
import type { EditorManager } from '../ui/editor-manager';
import { renderAppShell } from '../ui/components/AppShell';
import { initializeSymbolPicker } from '../ui/symbolPicker';
import { projectSession } from '../services/ProjectSessionStore';
import { registerServiceWorker } from '../sw-registration';
import { previewMetrics } from '../perf/preview-metrics';
import type { Platform } from '../platform/types';
import { showNotice } from '../ui/components/Notice';
import { describeWorkspaceError } from '../services/project-runtime-feedback';
import { setupEditorControls } from './setupEditorControls';
import { setupAppLifecycle } from './setupAppLifecycle';
import { setupWritingWorkflow } from './setupWritingWorkflow';
import { restoreInitialWorkspace } from './restoreInitialWorkspace';
import { initTaskPanelResizer } from '../ui/task-panel-resizer';
import { initTaskPanelActions } from '../ui/task-panel-actions';
import { initTaskPanelViews } from '../ui/task-panel-views';

let editorManager: EditorManager;
type StartupWindow = Window & {
  __CLEAR_WRITER_READY__?: boolean;
};

function setupPreviewDiagnosticsChip() {
  const diagnostics = document.getElementById('workspace-diagnostics');
  if (!diagnostics) return;

  const render = () => {
    diagnostics.textContent = previewMetrics.formatChipSummary();
    diagnostics.title = 'Snapshot load time and preview render count';
  };

  render();
  previewMetrics.subscribe(render);
}

function setupPreviewDiagnosticsPanel() {
  const panel = document.getElementById('preview-diagnostics-panel');
  const output = document.getElementById('preview-diagnostics-output');
  if (!panel || !output || new URLSearchParams(window.location.search).get('preview-diagnostics') !== 'true') return;

  panel.removeAttribute('hidden');
  const render = () => {
    const record = [...previewMetrics.snapshot().previewTimings].reverse().find(item => item.kind === 'document-preview');
    if (!record) {
      output.textContent = 'No full-document preview timing recorded.';
      return;
    }
    const phaseLines = record.phases
      .filter(phase => phase.phase !== 'total')
      .map(phase => `  ${phase.phase}: ${formatDiagnosticDuration(phase.durationMs)}`);
    const metadata = Object.entries(record.metadata)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `  ${key}: ${String(value)}`);
    const longestPage = record.pageTimings?.reduce<{ pageNumber: number; deltaMs: number } | undefined>((current, page) =>
      !current || page.deltaMs > current.deltaMs ? page : current, undefined);
    output.textContent = [
      `status: ${record.status}`,
      `operation: ${record.operationId}`,
      `total: ${formatDiagnosticDuration(record.totalDurationMs)}`,
      `slowest phase: ${record.slowestPhase ?? 'none'}`,
      'phases:',
      ...phaseLines,
      'metadata:',
      ...metadata,
      ...(record.pageTimings && record.pageTimings.length > 0
        ? [`page timings: ${record.pageTimings.length}`, `longest page gap: page ${longestPage?.pageNumber ?? '?'} (${formatDiagnosticDuration(longestPage?.deltaMs ?? 0)})`]
        : []),
      ...(record.errorMessage ? [`error: ${record.errorMessage}`] : [])
    ].join('\n');
  };
  render();
  previewMetrics.subscribe(render);
}

function formatDiagnosticDuration(durationMs: number): string {
  return `${durationMs.toFixed(durationMs >= 100 ? 0 : 1)}ms`;
}

export async function bootApp(platform: Platform) {
  // Keep the CodeMirror/editor graph out of the initial application entry.
  // The shell can render while this feature chunk is fetched and evaluated.
  const { EditorManager } = await import('../ui/editor-manager');
  const appContainer = document.getElementById('app');
  if (appContainer) {
    renderAppShell(appContainer);
  }
  initTaskPanelResizer();
  initTaskPanelActions(platform);

  editorManager = new EditorManager(platform);
  // Expose for smoke tests
  (window as any).__CLEAR_WRITER_EDITOR_MANAGER__ = editorManager;
  
  setupPreviewDiagnosticsChip();
  setupPreviewDiagnosticsPanel();
  initializeSymbolPicker(() => editorManager.getEditorView());

  setupEditorControls(editorManager);

  async function saveSettingsWithNotice(patch: import('../types').ProjectSettingsPatch) {
    try {
      await projectSession.updateSettings(patch);
    } catch (error) {
      console.error('Settings were not saved:', error);
      showNotice(describeWorkspaceError(error, 'settings'), 'error');
      throw error;
    }
  }

  void import('./setupPdfPreview')
    .then(({ setupPdfPreview }) => setupPdfPreview(editorManager))
    .catch(error => {
      console.error('Clear Writer PDF preview controls failed to load:', error);
      showNotice('PDF preview is temporarily unavailable.', 'error');
    });

  setupAppLifecycle(platform, editorManager);

  setupWritingWorkflow(editorManager);

  let settingsReady: Promise<void> | null = null;
  const ensureSettings = async () => {
    settingsReady ??= Promise.all([
      import('../ui/settings-drawer'),
      import('./setupSettingsFeatures')
    ]).then(([{ initSettingsDrawer }, { setupSettingsFeatures }]) => {
      initSettingsDrawer(false);
      setupSettingsFeatures(platform, saveSettingsWithNotice, async (imageSetup) => {
        try {
          // Include the active editor's unsaved changes in the project-wide reset.
          await editorManager.flushCurrentDocument();
          const changed = await projectSession.resetImagePresentation(imageSetup);
          changed.forEach(section => editorManager.replaceCurrentDocument(section.path, section.content));
          showNotice(
            changed.length === 0
              ? 'Image settings saved. No existing image attributes needed updating.'
              : `Image settings applied to ${changed.length} section${changed.length === 1 ? '' : 's'}.`
          );
        } catch (error) {
          console.error('Image settings were not applied:', error);
          showNotice(describeWorkspaceError(error, 'settings'), 'error');
          throw error;
        }
      });
    });
    await settingsReady;
    const { openSettingsDrawer } = await import('../ui/settings-drawer');
    openSettingsDrawer();
  };

  let writingToolsReady: Promise<void> | null = null;
  const ensureWritingTools = async () => {
    writingToolsReady ??= import('./setupWritingTools')
      .then(({ setupWritingTools }) => setupWritingTools(platform, editorManager));
    await writingToolsReady;
  };

  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('#btn-activity-settings, #btn-activity-outline, #btn-open-project-search, #btn-open-project-review')
      : null;
    if (!target) return;

    if (target.id === 'btn-activity-settings') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void ensureSettings().catch(error => {
        console.error('Clear Writer settings features failed to load:', error);
        showNotice('Settings are temporarily unavailable.', 'error');
      });
      return;
    }

    if (writingToolsReady) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void ensureWritingTools()
      .then(() => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
      .catch(error => {
        console.error('Clear Writer writing tools failed to load:', error);
        showNotice('Project tools are temporarily unavailable.', 'error');
      });
  }, true);

  initTaskPanelViews(editorManager, platform.assetResolver);

  await restoreInitialWorkspace(platform, editorManager);

  (window as StartupWindow).__CLEAR_WRITER_READY__ = true;
  registerServiceWorker();
}
