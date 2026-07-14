import { pageSetupDrawerContentTemplate } from './PageSetupDrawer';
import { typographyDrawerContentTemplate } from './TypographyDrawer';
import { listsDrawerContentTemplate } from './ListsDrawer';
import { tablesDrawerContentTemplate } from './TablesDrawer';
import { imageSettingsDrawerContentTemplate } from './ImageSettingsDrawer';
import { tocSetupDrawerContentTemplate } from './TocSetupDrawer';
import { editorSettingsDrawerContentTemplate } from './EditorSettingsDrawer';
import { specialHeadingsDrawerContentTemplate } from './SpecialHeadingsDrawer';
import {
  customInlineStylesContentTemplate,
  customQuoteStylesContentTemplate
} from './CustomStylesDrawerTemplate';

const settingsTabs = [
  ['page-setup', 'Page setup'],
  ['typography', 'Typography styles'],
  ['lists', 'Lists'],
  ['tables', 'Tables'],
  ['images', 'Images'],
  ['toc', 'TOC'],
  ['special-headings', 'Special headings'],
  ['editor', 'Editor settings'],
  ['inline-styles', 'Custom inline styles'],
  ['quote-styles', 'Custom quote styles']
] as const;

const renderSettingsTab = (id: string, label: string, active = false): string => `
  <button
    class="settings-tab${active ? ' active' : ''}"
    type="button"
    role="tab"
    data-settings-tab="${id}"
    aria-controls="settings-panel-${id}"
    aria-selected="${active ? 'true' : 'false'}"
  >${label}</button>
`;

const renderSettingsPanel = (id: string, content: string, active = false): string => `
  <section
    id="settings-panel-${id}"
    class="settings-tab-panel${active ? '' : ' hidden'}"
    role="tabpanel"
    data-settings-panel="${id}"
  >
    ${content}
  </section>
`;

export const settingsDrawerTemplate = (): string => `
  <aside id="settings-drawer" class="drawer settings-drawer hidden" aria-label="Settings">
    <div class="drawer-header">
      <div class="drawer-title-block">
        <span class="drawer-eyebrow">Document</span>
        <span>Settings</span>
      </div>
      <button id="btn-close-settings-drawer" class="drawer-close-button" type="button" aria-label="Close settings">✕</button>
    </div>
    <div class="settings-drawer-layout">
      <nav class="settings-tab-list" role="tablist" aria-label="Settings sections">
        ${settingsTabs.map(([id, label], index) => renderSettingsTab(id, label, index === 0)).join('')}
      </nav>
      <div class="settings-tab-panels">
        ${renderSettingsPanel('page-setup', pageSetupDrawerContentTemplate(), true)}
        ${renderSettingsPanel('typography', typographyDrawerContentTemplate())}
        ${renderSettingsPanel('lists', listsDrawerContentTemplate())}
        ${renderSettingsPanel('tables', tablesDrawerContentTemplate())}
        ${renderSettingsPanel('images', imageSettingsDrawerContentTemplate())}
        ${renderSettingsPanel('toc', tocSetupDrawerContentTemplate())}
        ${renderSettingsPanel('special-headings', specialHeadingsDrawerContentTemplate())}
        ${renderSettingsPanel('editor', editorSettingsDrawerContentTemplate())}
        ${renderSettingsPanel('inline-styles', customInlineStylesContentTemplate())}
        ${renderSettingsPanel('quote-styles', customQuoteStylesContentTemplate())}
      </div>
    </div>
  </aside>
`;
