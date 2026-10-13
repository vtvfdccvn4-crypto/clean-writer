import { editorSettingsDrawerContentTemplate } from './EditorSettingsDrawer';

const renderDrawerTab = (id: string, label: string, active = false): string => `
  <button
    class="settings-tab${active ? ' active' : ''}"
    type="button"
    role="tab"
    data-settings-tab="${id}"
    aria-controls="settings-panel-${id}"
    aria-selected="${active ? 'true' : 'false'}"
  >${label}</button>
`;

const renderDrawerPanel = (id: string, content: string, active = false): string => `
  <section
    id="settings-panel-${id}"
    class="settings-tab-panel${active ? '' : ' hidden'}"
    role="tabpanel"
    data-settings-panel="${id}"
  >
    ${content}
  </section>
`;

export const preferencesDrawerTemplate = (): string => `
  <aside id="preferences-drawer" class="drawer settings-drawer hidden" aria-label="Preferences">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span class="drawer-eyebrow">Device</span>
        <span>Preferences</span>
      </div>
      <button id="btn-close-preferences-drawer" class="ui-button ui-button--icon-compact drawer-close-button" type="button" aria-label="Close preferences">✕</button>
    </div>
    <div class="settings-drawer-layout">
      <nav class="settings-tab-list" role="tablist" aria-label="Preferences sections">
        ${renderDrawerTab('editor', 'Editor', true)}
      </nav>
      <div class="settings-tab-panels">
        ${renderDrawerPanel('editor', editorSettingsDrawerContentTemplate(), true)}
      </div>
    </div>
  </aside>
`;
