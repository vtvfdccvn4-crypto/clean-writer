import { state } from '../state';
import type { ProjectMetadata } from '../state';
import { closeDrawer, toggleDrawer } from './drawer-manager';
import { bindProjectSettingsPanel } from './project-settings-panel';

export function initProjectMetadataDrawer(onSaveMetadata: (metadata: ProjectMetadata) => Promise<void>) {
  const btnProjectMetadata = document.getElementById('btn-project-metadata');
  const projectMetadataDrawer = document.getElementById('project-metadata-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-metadata-drawer');
  const btnApplyMetadata = document.getElementById('btn-apply-metadata');

  if (!btnProjectMetadata || !projectMetadataDrawer || !btnCloseDrawer || !btnApplyMetadata) {
    console.warn('[ProjectMetadata] Drawer elements not found');
    return;
  }

  const inputs = {
    author: document.getElementById('meta-author') as HTMLInputElement,
    documentTitle: document.getElementById('meta-doc-title') as HTMLInputElement,
    documentName: document.getElementById('meta-doc-name') as HTMLInputElement,
    documentNumber: document.getElementById('meta-doc-number') as HTMLInputElement,
    documentRevision: document.getElementById('meta-doc-revision') as HTMLInputElement,
    documentType: document.getElementById('meta-doc-type') as HTMLInputElement,
    productName: document.getElementById('meta-prod-name') as HTMLInputElement,
    productModule: document.getElementById('meta-prod-module') as HTMLInputElement,
    productVersion: document.getElementById('meta-prod-version') as HTMLInputElement
  };

  state.onProjectMetadataChanged(syncInputs);
  bindProjectSettingsPanel(syncInputs);

  btnProjectMetadata.addEventListener('click', () => {
    if (projectMetadataDrawer.classList.contains('hidden')) {
      syncInputs();
    }
    toggleDrawer(projectMetadataDrawer);
  });

  btnCloseDrawer.addEventListener('click', () => {
    closeDrawer(projectMetadataDrawer);
  });

  btnApplyMetadata.addEventListener('click', async () => {
    const metadata: ProjectMetadata = {
      author: inputs.author.value,
      documentTitle: inputs.documentTitle.value,
      documentName: inputs.documentName.value,
      documentNumber: inputs.documentNumber.value,
      documentRevision: inputs.documentRevision.value,
      documentType: inputs.documentType.value,
      productName: inputs.productName.value,
      productModule: inputs.productModule.value,
      productVersion: inputs.productVersion.value
    };
    
    await onSaveMetadata(metadata);
  });

  function syncInputs() {
    const data = state.current.projectMetadata;
    if (!data) return;
    inputs.author.value = data.author || '';
    inputs.documentTitle.value = data.documentTitle || '';
    inputs.documentName.value = data.documentName || '';
    inputs.documentNumber.value = data.documentNumber || '';
    inputs.documentRevision.value = data.documentRevision || '';
    inputs.documentType.value = data.documentType || '';
    inputs.productName.value = data.productName || '';
    inputs.productModule.value = data.productModule || '';
    inputs.productVersion.value = data.productVersion || '';
  }

  // Initial sync
  syncInputs();
}
