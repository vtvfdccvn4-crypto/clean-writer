import { renderDrawerControl, renderDrawerSwitchControl } from './drawerControls';

export const shellPreferencesDrawerTemplate = (): string => `
  <aside id="shell-preferences-drawer" class="drawer settings-drawer hidden" aria-label="Shell preferences">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span class="drawer-eyebrow">Device</span>
        <span>Shell</span>
      </div>
      <button id="btn-close-shell-preferences-drawer" class="ui-button ui-button--icon-compact drawer-close-button" type="button" aria-label="Close shell preferences">✕</button>
    </div>
    <div class="settings-drawer-layout">
      <nav class="settings-tab-list" role="tablist" aria-label="Shell sections">
        <button
          class="settings-tab active"
          type="button"
          role="tab"
          data-settings-tab="shell-ui"
          aria-controls="settings-panel-shell-ui"
          aria-selected="true"
        >UI</button>
      </nav>
      <div class="settings-tab-panels">
        <section
          id="settings-panel-shell-ui"
          class="settings-tab-panel"
          role="tabpanel"
          data-settings-panel="shell-ui"
        >
          <div class="drawer-body">
            <section class="drawer-card">
              <div class="drawer-card-head">
                <span>Appearance</span>
              </div>
              ${renderDrawerControl('Activity bar labels', renderDrawerSwitchControl('shell-activity-labels', 'Show activity bar labels'))}
              ${renderDrawerControl('Status bar', renderDrawerSwitchControl('shell-status-bar', 'Show status bar'))}
            </section>
          </div>
        </section>
      </div>
    </div>
  </aside>
`;
