import '../../src/style.css';

// Each entry mounts one component in its resting state. `html` is inserted
// into a host that carries any ancestor classes the component's rules need,
// so a selector like `.preview-toolbar .panel-actions` still matches.
const probes: { name: string; selector: string; html: string }[] = [
  { name: 'panel-bar', selector: '.panel-bar', html: '<div class="panel-bar panel-header"></div>' },
  { name: 'panel-footer', selector: '.panel-footer', html: '<div class="panel-bar panel-footer"></div>' },
  { name: 'activity-bar', selector: '.activity-bar', html: '<div class="activity-bar"></div>' },
  { name: 'activity-bar-button', selector: '.activity-bar-button', html: '<div class="activity-bar"><button class="activity-bar-button"></button></div>' },
  { name: 'activity-bar-button-active', selector: '.activity-bar-button', html: '<div class="activity-bar"><button class="activity-bar-button is-active"></button></div>' },
  { name: 'drawer', selector: '.drawer', html: '<div class="drawer"></div>' },
  { name: 'drawer-header', selector: '.drawer-header', html: '<div class="drawer"><div class="drawer-header"></div></div>' },
  { name: 'button-icon', selector: '.ui-button--icon', html: '<button class="ui-button ui-button--icon"></button>' },
  { name: 'button-primary', selector: '.ui-button--primary', html: '<button class="ui-button ui-button--primary"></button>' },
  { name: 'button-text', selector: '.ui-button--text', html: '<button class="ui-button ui-button--text"></button>' },
  { name: 'status-dot', selector: '.status-dot', html: '<span class="status-dot"></span>' },
  { name: 'status-dot-saved', selector: '.status-dot', html: '<span class="status-dot saved"></span>' },
  { name: 'status-dot-dirty', selector: '.status-dot', html: '<span class="status-dot dirty"></span>' },
  { name: 'status-dot-error', selector: '.status-dot', html: '<span class="status-dot error"></span>' },
  { name: 'preview-toolbar', selector: '.preview-toolbar', html: '<div class="preview-toolbar panel-bar panel-header"></div>' },
  { name: 'preview-diagnostics-panel', selector: '.preview-diagnostics-panel', html: '<div class="preview-diagnostics-panel"></div>' },
  { name: 'editor-container', selector: '.editor-container', html: '<div class="editor-container"></div>' },
  { name: 'welcome-action', selector: '.welcome-action', html: '<button class="welcome-action"></button>' },
  // The printed page box. Its shadow must stay a screen-only concern, so the
  // baseline records it here and a sibling entry records the print result.
  { name: 'pagedjs-page', selector: '.pagedjs_page', html: '<div class="pagedjs_page"></div>' }
];

// Properties that a colour or type refactor can move. Longhand only: the
// shorthands serialise inconsistently across engines.
const properties = [
  'background-color',
  'color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'font-family',
  'font-size',
  'font-weight'
];

function collect(mediaLabel: string) {
  const stage = document.querySelector('#probe-stage') as HTMLElement;
  const readings: Record<string, Record<string, string>> = {};

  for (const probe of probes) {
    stage.innerHTML = probe.html;
    const element = stage.querySelector(probe.selector);
    if (!element) throw new Error(`Probe "${probe.name}" did not match ${probe.selector}`);
    const computed = getComputedStyle(element);
    const reading: Record<string, string> = {};
    for (const property of properties) reading[property] = computed.getPropertyValue(property).trim();
    readings[probe.name] = reading;
  }

  stage.innerHTML = '';
  return { media: mediaLabel, readings };
}

declare global {
  interface Window {
    __collectComputedStyles?: (mediaLabel: string) => unknown;
    __probeReady?: boolean;
  }
}

window.__collectComputedStyles = collect;

void document.fonts.ready.then(() => {
  window.__probeReady = true;
});
