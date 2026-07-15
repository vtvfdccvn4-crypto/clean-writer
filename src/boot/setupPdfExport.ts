import { state } from '../state';
import type { Platform } from '../platform/types';
import type { EditorManager } from '../ui/editor-manager';
import { showNotice } from '../ui/components/Notice';

export function markExportUnavailable(button: HTMLElement, label: string): void {
  button.setAttribute('disabled', 'true');
  button.setAttribute('aria-disabled', 'true');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.dataset.exportStatus = 'unavailable';
}

/** Registers the supported browser PDF export action and its UI state. */
export function setupPdfExport(platform: Platform, editorManager: EditorManager): void {
  const button = document.getElementById('btn-export-pdf');
  if (!button) return;
  if (!platform.exportService.support.pdf) {
    markExportUnavailable(button, 'PDF export is unavailable in this runtime');
    return;
  }

  const setExportStatus = (status: 'idle' | 'preparing' | 'exporting' | 'exported' | 'failed') => {
    const labels = {
      idle: 'Export PDF',
      preparing: 'Preparing PDF…',
      exporting: 'Exporting PDF…',
      exported: 'PDF exported',
      failed: 'PDF export failed'
    };
    button.dataset.exportStatus = status;
    button.setAttribute('aria-label', labels[status]);
    button.title = labels[status];
    if (status === 'exporting') button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  };

  button.addEventListener('click', async () => {
    button.setAttribute('disabled', 'true');
    setExportStatus('preparing');
    const exportWindow = platform.exportService.preparePdfExport?.();
    if (platform.exportService.preparePdfExport && !exportWindow) {
      setExportStatus('failed');
      showNotice('PDF export could not open its save window. Allow popups for Clear Writer and try again.', 'error');
      button.removeAttribute('disabled');
      return;
    }
    try {
      const exportDocument = await editorManager.compilePaginatedExportSnapshot();
      setExportStatus('exporting');
      const success = await platform.exportService.exportPdf(
        exportDocument.html,
        exportDocument.pageSetup,
        state.current.typographySetup,
        state.current.listSetup,
        state.current.tableSetup,
        state.current.projectMetadata,
        state.current.projectRef ? state.current.projectRef.id : null,
        exportWindow,
        exportDocument.paginationCss
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
      const detail = error instanceof Error && error.message
        ? ` ${error.message}`
        : '';
      showNotice(`PDF export failed.${detail} The document remains open and unchanged.`, 'error');
    } finally {
      setTimeout(() => {
        setExportStatus('idle');
        button.removeAttribute('disabled');
      }, 3000);
    }
  });
}
