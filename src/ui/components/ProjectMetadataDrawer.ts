const renderField = (id: string, label: string, placeholder: string) => `
  <label class="drawer-control">
    <span>${label}</span>
    <input id="${id}" type="text" placeholder="${placeholder}">
  </label>
`;

export const projectMetadataDrawerTemplate = (): string => `
  <div id="project-metadata-drawer" class="drawer hidden" aria-label="Project metadata">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span class="drawer-eyebrow">Project</span>
        <h3>Metadata</h3>
      </div>
      <button id="btn-close-metadata-drawer" class="drawer-close-button" type="button" aria-label="Close project metadata">✕</button>
    </div>
    <div class="drawer-body">
      <section class="drawer-card">
        <div class="drawer-card-head">
          <h5>Document identity</h5>
          <span>Author and title</span>
        </div>
        ${renderField('meta-author', 'Author', 'Author name')}
        ${renderField('meta-doc-title', 'Document title', 'Document title')}
        ${renderField('meta-doc-name', 'Document name', 'Document name')}
      </section>

      <section class="drawer-card">
        <div class="drawer-card-head">
          <h5>Tracking</h5>
          <span>Numbers and versions</span>
        </div>
        ${renderField('meta-doc-number', 'Document number', 'Document number')}
        ${renderField('meta-doc-revision', 'Document revision', 'Revision')}
        ${renderField('meta-doc-type', 'Document type', 'Document type')}
      </section>

      <section class="drawer-card">
        <div class="drawer-card-head">
          <h5>Product</h5>
          <span>Model context</span>
        </div>
        ${renderField('meta-prod-name', 'Product name', 'Product name')}
        ${renderField('meta-prod-module', 'Product module', 'Product module')}
        ${renderField('meta-prod-version', 'Product version', 'Product version')}
      </section>

      <button id="btn-apply-metadata" class="drawer-primary-button" type="button">Apply settings</button>
    </div>
  </div>
`;
