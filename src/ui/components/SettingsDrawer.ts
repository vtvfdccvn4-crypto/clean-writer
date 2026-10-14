import { pageSetupDrawerContentTemplate } from './PageSetupDrawer';
import { typographyDrawerContentTemplate } from './TypographyDrawer';
import { listsDrawerContentTemplate } from './ListsDrawer';
import { tablesDrawerContentTemplate } from './TablesDrawer';
import { imageSettingsDrawerContentTemplate } from './ImageSettingsDrawer';
import { tocSetupDrawerContentTemplate } from './TocSetupDrawer';
import { specialHeadingsDrawerContentTemplate } from './SpecialHeadingsDrawer';
import {
  customInlineStylesContentTemplate,
  customQuoteStylesContentTemplate
} from './CustomStylesDrawerTemplate';

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

export const pageSetupDrawerTemplate = (): string => `
  <aside id="page-setup-drawer" class="drawer settings-drawer hidden" aria-label="Page setup">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span class="drawer-eyebrow">Document</span>
        <span>Page Setup</span>
      </div>
      <button id="btn-close-page-setup-drawer" class="ui-button ui-button--icon-compact drawer-close-button" type="button" aria-label="Close page setup">✕</button>
    </div>
    <div class="settings-drawer-layout">
      <nav class="settings-tab-list" role="tablist" aria-label="Page setup sections">
        ${renderDrawerTab('page-setup', 'Page', true)}
        ${renderDrawerTab('toc', 'Table of contents')}
        ${renderDrawerTab('special-headings', 'Special headings')}
      </nav>
      <div class="settings-tab-panels">
        ${renderDrawerPanel('page-setup', pageSetupDrawerContentTemplate(), true)}
        ${renderDrawerPanel('toc', tocSetupDrawerContentTemplate())}
        ${renderDrawerPanel('special-headings', specialHeadingsDrawerContentTemplate())}
      </div>
    </div>
  </aside>
`;

export const stylesDrawerTemplate = (): string => `
  <aside id="styles-drawer" class="drawer settings-drawer hidden" aria-label="Styles">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span class="drawer-eyebrow">Document</span>
        <span>Styles</span>
      </div>
      <button id="btn-close-styles-drawer" class="ui-button ui-button--icon-compact drawer-close-button" type="button" aria-label="Close styles">✕</button>
    </div>
    <div class="settings-drawer-layout">
      <nav class="settings-tab-list" role="tablist" aria-label="Style sections">
        ${renderDrawerTab('typography', 'Typography', true)}
        ${renderDrawerTab('lists', 'Lists')}
        ${renderDrawerTab('tables', 'Tables')}
        ${renderDrawerTab('images', 'Images')}
        ${renderDrawerTab('inline-styles', 'Inline styles')}
        ${renderDrawerTab('quote-styles', 'Block styles')}
      </nav>
      <div class="settings-tab-panels">
        ${renderDrawerPanel('typography', typographyDrawerContentTemplate(), true)}
        ${renderDrawerPanel('lists', listsDrawerContentTemplate())}
        ${renderDrawerPanel('tables', tablesDrawerContentTemplate())}
        ${renderDrawerPanel('images', imageSettingsDrawerContentTemplate())}
        ${renderDrawerPanel('inline-styles', customInlineStylesContentTemplate())}
        ${renderDrawerPanel('quote-styles', customQuoteStylesContentTemplate())}
      </div>
    </div>
  </aside>
`;

/** @deprecated Use pageSetupDrawerTemplate() or stylesDrawerTemplate() instead. */
export const settingsDrawerTemplate = pageSetupDrawerTemplate;
