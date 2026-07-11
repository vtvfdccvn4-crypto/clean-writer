import { renderFontFamilyOptions } from '../../config/font-families';

export function renderDrawerSwitch(id: string, label: string, className = ''): string {
  const classes = ['drawer-switch', className].filter(Boolean).join(' ');
  const isVisibilityControl = /^(show|display)\b/i.test(label);
  const enabledLabel = isVisibilityControl ? 'Show' : 'On';
  const disabledLabel = isVisibilityControl ? 'Hide' : 'Off';
  return `
    <label class="${classes}">
      <span class="drawer-switch-label">${label}</span>
      <span class="drawer-switch-ui">
        <input type="checkbox" id="${id}" aria-label="${label}">
        <span class="drawer-switch-option drawer-switch-option--enabled" aria-hidden="true">${enabledLabel}</span>
        <span class="drawer-switch-option drawer-switch-option--disabled" aria-hidden="true">${disabledLabel}</span>
      </span>
    </label>
  `;
}

export function renderDrawerSwitchControl(
  id: string,
  ariaLabel: string,
  className = '',
  enabledLabel = 'On',
  disabledLabel = 'Off'
): string {
  const classes = ['drawer-switch', 'drawer-switch--control', className].filter(Boolean).join(' ');
  return `
    <label class="${classes}">
      <span class="drawer-switch-ui">
        <input type="checkbox" id="${id}" aria-label="${ariaLabel}">
        <span class="drawer-switch-option drawer-switch-option--enabled" aria-hidden="true">${enabledLabel}</span>
        <span class="drawer-switch-option drawer-switch-option--disabled" aria-hidden="true">${disabledLabel}</span>
      </span>
    </label>
  `;
}

const drawerFontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 48, 72];

export type DrawerAlignmentPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

const drawerAlignmentOptions: Array<{
  value: DrawerAlignmentPreset;
  label: string;
  horizontalAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
}> = [
  { value: 'top-left', label: 'Top left', horizontalAlign: 'left', verticalAlign: 'top' },
  { value: 'top-center', label: 'Top center', horizontalAlign: 'center', verticalAlign: 'top' },
  { value: 'top-right', label: 'Top right', horizontalAlign: 'right', verticalAlign: 'top' },
  { value: 'middle-left', label: 'Middle left', horizontalAlign: 'left', verticalAlign: 'middle' },
  { value: 'middle', label: 'Middle', horizontalAlign: 'center', verticalAlign: 'middle' },
  { value: 'middle-right', label: 'Middle right', horizontalAlign: 'right', verticalAlign: 'middle' },
  { value: 'bottom-left', label: 'Bottom left', horizontalAlign: 'left', verticalAlign: 'bottom' },
  { value: 'bottom-center', label: 'Bottom center', horizontalAlign: 'center', verticalAlign: 'bottom' },
  { value: 'bottom-right', label: 'Bottom right', horizontalAlign: 'right', verticalAlign: 'bottom' }
];

export function resolveDrawerAlignmentPreset(
  horizontalAlign: string | null | undefined,
  verticalAlign: string | null | undefined
): DrawerAlignmentPreset {
  const horizontal = horizontalAlign === 'left' || horizontalAlign === 'center' || horizontalAlign === 'right'
    ? horizontalAlign
    : 'center';
  const vertical = verticalAlign === 'top' || verticalAlign === 'middle' || verticalAlign === 'bottom'
    ? verticalAlign
    : 'middle';

  const exactMatch = drawerAlignmentOptions.find(option =>
    option.horizontalAlign === horizontal && option.verticalAlign === vertical
  );

  return (exactMatch?.value ?? 'middle') as DrawerAlignmentPreset;
}

export function resolveDrawerAlignmentValues(value: string | null | undefined): {
  horizontalAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
} {
  const preset = drawerAlignmentOptions.find(option => option.value === value) ?? drawerAlignmentOptions[4];
  return {
    horizontalAlign: preset.horizontalAlign,
    verticalAlign: preset.verticalAlign
  };
}

export function renderDrawerAlignmentOptions(selectedValue: string | null | undefined): string {
  const selected = drawerAlignmentOptions.find(option => option.value === selectedValue)?.value ?? 'middle';
  return drawerAlignmentOptions
    .map(option => `<option value="${option.value}"${option.value === selected ? ' selected' : ''}>${option.label}</option>`)
    .join('');
}

type DrawerToggleTarget = string | HTMLButtonElement | HTMLInputElement;

function resolveDrawerToggleControl(target: DrawerToggleTarget): HTMLButtonElement | HTMLInputElement | null {
  if (typeof target === 'string') {
    return document.getElementById(target) as HTMLButtonElement | HTMLInputElement | null;
  }

  return target;
}

export interface DrawerNumberOptions {
  integer?: boolean;
  min?: number;
  max?: number;
}

export function readDrawerNumber(
  target: string | HTMLInputElement | HTMLSelectElement,
  fallback: number,
  options: DrawerNumberOptions = {}
): number {
  const input = typeof target === 'string'
    ? document.getElementById(target) as HTMLInputElement | HTMLSelectElement | null
    : target;
  if (!input) return fallback;
  const parsed = options.integer ? Number.parseInt(input.value, 10) : Number.parseFloat(input.value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(options.max ?? Number.POSITIVE_INFINITY, Math.max(options.min ?? Number.NEGATIVE_INFINITY, parsed));
}

export function renderDrawerToggleButton(id: string, glyph: string, ariaLabel: string, className = ''): string {
  const classes = ['drawer-toggle-button', className].filter(Boolean).join(' ');
  return `
    <button id="${id}" class="${classes}" type="button" aria-pressed="false" aria-label="${ariaLabel}">
      <span class="drawer-toggle-button-glyph" aria-hidden="true">${glyph}</span>
    </button>
  `;
}

export function getDrawerToggleButtonState(target: DrawerToggleTarget): boolean {
  const control = resolveDrawerToggleControl(target);
  if (!control) return false;
  if (control instanceof HTMLInputElement) return control.checked;
  return control.getAttribute('aria-pressed') === 'true';
}

export function setDrawerToggleButtonState(target: DrawerToggleTarget, active: boolean): void {
  const control = resolveDrawerToggleControl(target);
  if (!control) return;
  if (control instanceof HTMLInputElement) {
    control.checked = active;
    return;
  }
  control.setAttribute('aria-pressed', active ? 'true' : 'false');
  control.classList.toggle('is-active', active);
}

export function bindDrawerToggleButton(
  target: DrawerToggleTarget,
  onChange?: (active: boolean, control: HTMLButtonElement | HTMLInputElement) => void
): void {
  const control = resolveDrawerToggleControl(target);
  if (!control) return;

  if (control instanceof HTMLInputElement) {
    control.addEventListener('change', () => {
      onChange?.(control.checked, control);
    });
    return;
  }

  control.addEventListener('click', () => {
    const next = !getDrawerToggleButtonState(control);
    setDrawerToggleButtonState(control, next);
    onChange?.(next, control);
  });
}

export function renderDrawerSizeSelect(id: string, selectedValue: number | string, includeDefault = false): string {
  const selected = selectedValue === '' ? '' : String(selectedValue);
  return `
    <select id="${id}" class="drawer-size-select">
      ${includeDefault ? `<option value=""${selected === '' ? ' selected' : ''}>Default</option>` : ''}
      ${drawerFontSizes.map(size => `<option value="${size}"${selected === String(size) ? ' selected' : ''}>${size} pt</option>`).join('')}
    </select>
  `;
}

export function renderDrawerColorControl(id: string, label: string, value = '#000000', className = ''): string {
  const classes = ['drawer-color-field', className].filter(Boolean).join(' ');
  const normalized = value.toUpperCase();
  return `
    <div class="${classes}" data-drawer-color-field>
      <input id="${id}" type="color" value="${value}" aria-label="${label}">
      <input class="drawer-color-code" type="text" value="${normalized}" readonly tabindex="-1" aria-hidden="true">
    </div>
  `;
}

export function renderDrawerControl(label: string, controlHtml: string, className = ''): string {
  const classes = ['drawer-control', className].filter(Boolean).join(' ');
  return `
    <div class="${classes}">
      <span class="drawer-control-label">${label}</span>
      <div class="drawer-control-value">${controlHtml}</div>
    </div>
  `;
}

export function initializeDrawerColorControls(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-drawer-color-field]').forEach((field) => {
    const colorInput = field.querySelector<HTMLInputElement>('input[type="color"]');
    const codeField = field.querySelector<HTMLInputElement>('.drawer-color-code');
    if (!colorInput || !codeField) return;

    const sync = () => {
      codeField.value = colorInput.value.toUpperCase();
    };

    sync();
    colorInput.addEventListener('input', sync);
    colorInput.addEventListener('change', sync);
  });
}

export interface DrawerFontStyleStackOptions {
  fontId: string;
  sizeId: string;
  colorId: string;
  boldId: string;
  italicId: string;
  sizeValue?: number | string;
  sizeIncludeDefault?: boolean;
  fontIncludeDefault?: boolean;
  colorValue?: string;
}

export function renderDrawerFontStyleStack(options: DrawerFontStyleStackOptions): string {
  const {
    fontId,
    sizeId,
    colorId,
    boldId,
    italicId,
    sizeValue = 11,
    sizeIncludeDefault = false,
    fontIncludeDefault = false,
    colorValue = '#000000'
  } = options;

  return `
    <div class="drawer-control-stack">
      ${renderDrawerControl(
        'Font family',
        `<select id="${fontId}">
          ${renderFontFamilyOptions(fontIncludeDefault)}
        </select>`,
      )}
      ${renderDrawerControl(
        'Size',
        renderDrawerSizeSelect(sizeId, sizeValue, sizeIncludeDefault),
      )}
      ${renderDrawerControl(
        'Colour',
        renderDrawerColorControl(colorId, 'Colour', colorValue),
      )}
      ${renderDrawerControl(
        'Bold',
        renderDrawerSwitchControl(boldId, 'Bold'),
      )}
      ${renderDrawerControl(
        'Italic',
        renderDrawerSwitchControl(italicId, 'Italic'),
      )}
    </div>
  `;
}
