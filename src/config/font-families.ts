export interface FontFamilyOption {
  value: string;
  label: string;
}

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  { value: 'Calibri', label: 'Calibri' },
  { value: 'Segoe UI', label: 'Segoe UI' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Cambria', label: 'Cambria' },
  { value: 'Candara', label: 'Candara' },
  { value: 'Constantia', label: 'Constantia' },
  { value: 'Corbel', label: 'Corbel' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Courier New', label: 'Courier New' }
];

export const FONT_FAMILY_VALUES = new Set(FONT_FAMILY_OPTIONS.map(option => option.value));

export const DEFAULT_HEADER_FOOTER_FONT_FAMILY = 'Calibri';
export const DEFAULT_BODY_FONT_FAMILY = 'Times New Roman';
export const DEFAULT_HEADING_FONT_FAMILY = 'Calibri';
export const DEFAULT_LIST_FONT_FAMILY = 'Times New Roman';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderFontFamilyOptions(includeDefault = false): string {
  const options = includeDefault
    ? [{ value: '', label: 'Default' }, ...FONT_FAMILY_OPTIONS]
    : FONT_FAMILY_OPTIONS;

  return options
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join('\n');
}

export function resolveFontFamily(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  return FONT_FAMILY_VALUES.has(normalized) ? normalized : fallback;
}

export function setFontFamilySelectValue(
  select: HTMLSelectElement,
  value: string | null | undefined,
  fallback = ''
): void {
  select.value = resolveFontFamily(value, fallback);
}
