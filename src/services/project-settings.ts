import { DEFAULT_EDITOR_SETUP, DEFAULT_IMAGE_SETUP, DEFAULT_LIST_SETUP, DEFAULT_PAGE_SETUP, DEFAULT_PROJECT_METADATA, DEFAULT_TABLE_SETUP, DEFAULT_TYPOGRAPHY_SETUP } from '../config/defaults';
import type { CustomBlockStyle, CustomStyle, ListSetup, ProjectMetadata, ProjectSettingsData, SpecialHeadingDefinition, TableSetup, TypographySetup } from '../types';
import { normalizeExplorerPath } from '../utils/path-utils';
import { resolveFontFamily } from '../config/font-families';

export const PROJECT_SETTINGS_SCHEMA_VERSION = 5;

export type ProjectSettingsInput = Partial<ProjectSettingsData> & Record<string, unknown>;

const KNOWN_SETTING_KEYS = new Set([
  'schemaVersion',
  'order',
  'pageBreaks',
  'hiddenHeaders',
  'hiddenFooters',
  'numberedHeadings',
  'tocSections',
  'pageSetup',
  'typographySetup',
  'listSetup',
  'tableSetup',
  'imageSetup',
  'projectMetadata',
  'customStyles',
  'customBlockStyles',
  'editorSetup'
]);

function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeWithDefaults<T>(defaults: T, value: unknown): T {
  if (Array.isArray(defaults)) {
    return Array.isArray(value) ? cloneValue(value) as T : cloneValue(defaults);
  }

  if (!isPlainObject(defaults)) {
    return (value === undefined ? cloneValue(defaults) : (value as T));
  }

  if (!isPlainObject(value)) {
    return cloneValue(defaults);
  }

  const result: Record<string, unknown> = {};
  for (const [key, defaultValue] of Object.entries(defaults as Record<string, unknown>)) {
    result[key] = mergeWithDefaults(defaultValue, value[key]);
  }

  for (const [key, extraValue] of Object.entries(value)) {
    if (!(key in result)) {
      result[key] = cloneValue(extraValue);
    }
  }

  return result as T;
}

function normalizePathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map(entry => (typeof entry === 'string' ? normalizeExplorerPath(entry) : ''))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeStyleList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map(item => cloneValue(item as T));
}

function normalizePageSetupInput(value: unknown): unknown {
  if (!isPlainObject(value) || !isPlainObject(value.toc)) return value;

  const toc = value.toc;
  const hasLevelStyles = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].some(key => isPlainObject(toc[key]));
  if (hasLevelStyles) return value;

  const isLegacyGlobalStyle = ['fontFamily', 'fontSize', 'color', 'isBold', 'isItalic']
    .some(key => key in toc);
  if (!isLegacyGlobalStyle) return value;

  return {
    ...value,
    toc: {
      maxLevel: 6,
      h1: cloneValue(toc),
      h2: cloneValue(toc),
      h3: cloneValue(toc),
      h4: cloneValue(toc),
      h5: cloneValue(toc),
      h6: cloneValue(toc)
    }
  };
}

function firstPresent(input: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function safeText(value: unknown, fallback = '', maxLength = 10_000): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numericValue)
    ? Math.min(max, Math.max(min, numericValue))
    : fallback;
}

function safeBool(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return ['true', '1', 'on', 'bold', 'italic'].includes(value.trim().toLowerCase());
  if (typeof value === 'number') return value !== 0;
  return false;
}

function safeBoolAlias(value: unknown, primary: string, alias: string): boolean {
  const record = value as Record<string, unknown>;
  return safeBool(record[primary]) || safeBool(record[alias]);
}

function safeBoolWithFallback(value: unknown, fallback: boolean): boolean {
  return value === undefined ? fallback : safeBool(value);
}

function safeBoolAliasWithFallback(value: unknown, primary: string, alias: string, fallback: boolean): boolean {
  const record = value as Record<string, unknown>;
  return record[primary] === undefined && record[alias] === undefined
    ? fallback
    : safeBoolAlias(record, primary, alias);
}

function safeColor(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value;
  return fallback;
}

function normalizeSpecialHeadings(value: unknown): SpecialHeadingDefinition[] {
  const fallback = DEFAULT_PAGE_SETUP.specialHeadings?.[0];
  if (!fallback || !Array.isArray(value)) return cloneValue(DEFAULT_PAGE_SETUP.specialHeadings ?? []);

  return value.filter(isPlainObject).slice(0, 50).map((item, index) => {
    const source = item as Record<string, unknown>;
    const id = safeText(source.id, '', 100);
    return {
      ...fallback,
      id: /^[a-z0-9][a-z0-9_-]*$/i.test(id) ? id : `${fallback.id}-${index + 1}`,
      name: safeText(source.name, fallback.name, 200),
      directive: safeText(source.directive, fallback.directive, 100),
      headingLevel: Math.trunc(safeNumber(source.headingLevel, fallback.headingLevel, 1, 6)),
      counterStart: Math.trunc(safeNumber(source.counterStart, fallback.counterStart, 1, 9_999)),
      counterPrefix: safeText(source.counterPrefix, fallback.counterPrefix, 200),
      counterSuffix: safeText(source.counterSuffix, fallback.counterSuffix, 200),
      breakBefore: safeBoolWithFallback(source.breakBefore, fallback.breakBefore),
      includeInToc: safeBoolWithFallback(source.includeInToc, fallback.includeInToc),
      fontFamily: resolveFontFamily(safeText(source.fontFamily, fallback.fontFamily, 200), fallback.fontFamily),
      fontSize: safeNumber(source.fontSize, fallback.fontSize, 1, 200),
      color: safeColor(source.color, fallback.color),
      isBold: safeBoolAliasWithFallback(source, 'isBold', 'bold', fallback.isBold),
      isItalic: safeBoolAliasWithFallback(source, 'isItalic', 'italic', fallback.isItalic),
      isAllCaps: safeBoolAliasWithFallback(source, 'isAllCaps', 'allCaps', fallback.isAllCaps),
      lineHeight: safeNumber(source.lineHeight, fallback.lineHeight, 0.5, 5),
      marginTop: safeNumber(source.marginTop, fallback.marginTop, 0, 500),
      marginBottom: safeNumber(source.marginBottom, fallback.marginBottom, 0, 500)
    };
  });
}

function validateSettingsValues(settings: ProjectSettingsData): ProjectSettingsData {
  const page = settings.pageSetup;
  page.paperWidth = safeNumber(page.paperWidth, DEFAULT_PAGE_SETUP.paperWidth, 50, 1_000);
  page.paperHeight = safeNumber(page.paperHeight, DEFAULT_PAGE_SETUP.paperHeight, 50, 1_000);
  for (const key of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'] as const) {
    page[key] = safeNumber(page[key], DEFAULT_PAGE_SETUP[key], 0, 200);
  }

  for (const rowKey of ['header', 'footer'] as const) {
    const row = page[rowKey];
    const defaultRow = DEFAULT_PAGE_SETUP[rowKey];
    row.centerWidth = typeof row.centerWidth === 'string' && /^(?:auto|\d+(?:\.\d+)?(?:px|pt|mm|cm|in|%))$/i.test(row.centerWidth)
      ? row.centerWidth
      : defaultRow.centerWidth;
    for (const cellKey of ['left', 'center', 'right'] as const) {
      const cell = row[cellKey];
      const fallback = defaultRow[cellKey];
      cell.content = safeText(cell.content, '', 10_000);
      cell.fontFamily = resolveFontFamily(cell.fontFamily ?? '', fallback.fontFamily ?? '');
      cell.fontSize = safeNumber(cell.fontSize, fallback.fontSize, 1, 200);
      cell.color = safeColor(cell.color, fallback.color);
      cell.isBold = safeBoolAlias(cell, 'isBold', 'bold');
      cell.isItalic = safeBoolAlias(cell, 'isItalic', 'italic');
    }
  }

  const toc = page.toc!;
  const defaultToc = DEFAULT_PAGE_SETUP.toc!;
  toc.maxLevel = Math.trunc(safeNumber(toc.maxLevel, defaultToc.maxLevel, 1, 6));
  for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    const style = toc[level];
    const fallback = defaultToc[level];
    style.fontFamily = resolveFontFamily(style.fontFamily ?? '', fallback.fontFamily ?? '');
    style.fontSize = safeNumber(style.fontSize, fallback.fontSize, 1, 200);
    style.color = safeColor(style.color, fallback.color);
    style.isBold = safeBoolAlias(style, 'isBold', 'bold');
    style.isItalic = safeBoolAlias(style, 'isItalic', 'italic');
    style.isAllCaps = safeBoolAlias(style, 'isAllCaps', 'allCaps');
  }

  for (const key of Object.keys(settings.typographySetup) as Array<keyof TypographySetup>) {
    const style = settings.typographySetup[key];
    const fallback = DEFAULT_TYPOGRAPHY_SETUP[key];
    style.fontFamily = resolveFontFamily(style.fontFamily ?? '', fallback.fontFamily ?? '');
    style.fontSize = safeNumber(style.fontSize, fallback.fontSize, 1, 200);
    style.color = safeColor(style.color, fallback.color);
    style.isBold = safeBoolAlias(style, 'isBold', 'bold');
    style.isItalic = safeBoolAlias(style, 'isItalic', 'italic');
    style.lineHeight = safeNumber(style.lineHeight, fallback.lineHeight, 0.5, 5);
    style.marginTop = safeNumber(style.marginTop, fallback.marginTop, 0, 500);
    style.marginBottom = safeNumber(style.marginBottom, fallback.marginBottom, 0, 500);
  }

  for (const key of Object.keys(settings.listSetup) as Array<keyof ListSetup>) {
    const style = settings.listSetup[key];
    const fallback = DEFAULT_LIST_SETUP[key];
    style.fontFamily = resolveFontFamily(style.fontFamily ?? '', fallback.fontFamily ?? '');
    style.fontSize = safeNumber(style.fontSize, fallback.fontSize, 1, 200);
    style.color = safeColor(style.color, fallback.color);
    style.isBold = safeBoolAlias(style, 'isBold', 'bold');
    style.isItalic = safeBoolAlias(style, 'isItalic', 'italic');
    style.lineHeight = safeNumber(style.lineHeight, fallback.lineHeight, 0.5, 5);
    style.bulletColor = safeColor(style.bulletColor, fallback.bulletColor);
    style.bulletIcon = safeText(style.bulletIcon, fallback.bulletIcon, 32);
    style.marginLeft = safeNumber(style.marginLeft, fallback.marginLeft, 0, 200);
    style.paddingLeft = safeNumber(style.paddingLeft, fallback.paddingLeft, 0, 200);
  }

  for (const key of Object.keys(settings.tableSetup) as Array<keyof TableSetup>) {
    const style = settings.tableSetup[key];
    const fallback = DEFAULT_TABLE_SETUP[key];
    style.fontFamily = resolveFontFamily(style.fontFamily ?? '', fallback.fontFamily ?? '');
    style.fontSize = safeNumber(style.fontSize, fallback.fontSize, 1, 200);
    style.headerTextColor = safeColor(style.headerTextColor, fallback.headerTextColor);
    style.headerBackground = safeColor(style.headerBackground, fallback.headerBackground);
    style.headerBold = style.headerBold === true;
    style.bodyTextColor = safeColor(style.bodyTextColor, fallback.bodyTextColor);
    style.bodyBackground = safeColor(style.bodyBackground, fallback.bodyBackground);
    style.alternateRowColor = safeColor(style.alternateRowColor, fallback.alternateRowColor);
    style.borderColor = safeColor(style.borderColor, fallback.borderColor);
    style.borderWidth = safeNumber(style.borderWidth, fallback.borderWidth, 0, 10);
    style.cellPadding = safeNumber(style.cellPadding, fallback.cellPadding, 0, 50);
    style.marginTop = safeNumber(style.marginTop, fallback.marginTop, 0, 200);
    style.marginBottom = safeNumber(style.marginBottom, fallback.marginBottom, 0, 200);
  }

  page.specialHeadings = normalizeSpecialHeadings(page.specialHeadings);

  settings.imageSetup.alignment = ['left', 'center', 'right'].includes(settings.imageSetup.alignment)
    ? settings.imageSetup.alignment
    : DEFAULT_IMAGE_SETUP.alignment;
  settings.imageSetup.marginTop = safeNumber(settings.imageSetup.marginTop, DEFAULT_IMAGE_SETUP.marginTop, 0, 200);
  settings.imageSetup.marginBottom = safeNumber(settings.imageSetup.marginBottom, DEFAULT_IMAGE_SETUP.marginBottom, 0, 200);

  settings.customStyles = settings.customStyles.map(style => ({
    ...style,
    id: safeText(style.id, '', 100),
    name: safeText(style.name, 'Unnamed Style', 200),
    openingPair: safeText(style.openingPair, '', 100),
    closingPair: safeText(style.closingPair, '', 100),
    fontFamily: resolveFontFamily(style.fontFamily, ''),
    fontSize: safeNumber(style.fontSize, 0, 0, 200),
    color: safeColor(style.color, undefined),
    isBold: safeBoolAlias(style, 'isBold', 'bold'),
    isItalic: safeBoolAlias(style, 'isItalic', 'italic')
  }));
  settings.customBlockStyles = settings.customBlockStyles.map(style => ({
    ...style,
    id: safeText(style.id, '', 100),
    name: safeText(style.name, 'Unnamed Block', 200),
    prefix: safeText(style.prefix, '', 100),
    icon: safeText(style.icon, '', 500),
    fontFamily: resolveFontFamily(style.fontFamily, ''),
    fontSize: safeNumber(style.fontSize, 0, 0, 200),
    color: safeColor(style.color, undefined),
    isBold: safeBoolAlias(style, 'isBold', 'bold'),
    isItalic: safeBoolAlias(style, 'isItalic', 'italic'),
    lineHeight: safeNumber(style.lineHeight, settings.typographySetup.paragraph.lineHeight, 0.5, 5),
    marginTop: safeNumber(style.marginTop, settings.typographySetup.paragraph.marginTop, 0, 500),
    marginBottom: safeNumber(style.marginBottom, settings.typographySetup.paragraph.marginBottom, 0, 500)
  }));

  for (const key of Object.keys(settings.projectMetadata) as Array<keyof ProjectMetadata>) {
    settings.projectMetadata[key] = safeText(settings.projectMetadata[key], '', 2_000);
  }
  return settings;
}

export function createDefaultProjectSettings(): ProjectSettingsData {
  return {
    schemaVersion: PROJECT_SETTINGS_SCHEMA_VERSION,
    order: [],
    pageBreaks: [],
    hiddenHeaders: [],
    hiddenFooters: [],
    numberedHeadings: [],
    tocSections: [],
    pageSetup: cloneValue(DEFAULT_PAGE_SETUP),
    typographySetup: cloneValue(DEFAULT_TYPOGRAPHY_SETUP),
    listSetup: cloneValue(DEFAULT_LIST_SETUP),
    tableSetup: cloneValue(DEFAULT_TABLE_SETUP),
    imageSetup: cloneValue(DEFAULT_IMAGE_SETUP),
    projectMetadata: cloneValue(DEFAULT_PROJECT_METADATA),
    customStyles: [],
    customBlockStyles: [],
    editorSetup: cloneValue(DEFAULT_EDITOR_SETUP)
  };
}

export function normalizeProjectSettings(raw: unknown): { settings: ProjectSettingsData; migrated: boolean } {
  const rawInput = isPlainObject(raw) ? raw : {};
  const container = firstPresent(rawInput, ['settings', 'projectSettings', 'configuration', 'config']);
  const input = isPlainObject(container)
    ? { ...container, ...rawInput }
    : rawInput;
  const settings: ProjectSettingsInput = {
    schemaVersion: PROJECT_SETTINGS_SCHEMA_VERSION,
    order: normalizePathList(input.order),
    pageBreaks: normalizePathList(input.pageBreaks),
    hiddenHeaders: normalizePathList(input.hiddenHeaders),
    hiddenFooters: normalizePathList(input.hiddenFooters),
    numberedHeadings: normalizePathList(input.numberedHeadings),
    tocSections: normalizePathList(input.tocSections),
    pageSetup: mergeWithDefaults(DEFAULT_PAGE_SETUP, normalizePageSetupInput(firstPresent(input, ['pageSetup', 'page', 'pageSettings']))),
    typographySetup: mergeWithDefaults(DEFAULT_TYPOGRAPHY_SETUP, firstPresent(input, ['typographySetup', 'typography', 'textStyles'])),
    listSetup: mergeWithDefaults(DEFAULT_LIST_SETUP, firstPresent(input, ['listSetup', 'lists', 'listStyles'])),
    tableSetup: mergeWithDefaults(DEFAULT_TABLE_SETUP, firstPresent(input, ['tableSetup', 'tables', 'tableStyles'])),
    imageSetup: mergeWithDefaults(DEFAULT_IMAGE_SETUP, firstPresent(input, ['imageSetup', 'images', 'imageSettings'])),
    projectMetadata: mergeWithDefaults(DEFAULT_PROJECT_METADATA, firstPresent(input, ['projectMetadata', 'metadata', 'documentMetadata'])),
    customStyles: normalizeStyleList<CustomStyle>(firstPresent(input, ['customStyles', 'styles', 'inlineStyles'])),
    customBlockStyles: normalizeStyleList<CustomBlockStyle>(firstPresent(input, ['customBlockStyles', 'blockStyles', 'customBlocks'])),
    editorSetup: mergeWithDefaults(DEFAULT_EDITOR_SETUP, firstPresent(input, ['editorSetup', 'editor', 'editorSettings']))
  };

  for (const [key, value] of Object.entries(input)) {
    if (!KNOWN_SETTING_KEYS.has(key)) {
      settings[key] = cloneValue(value);
    }
  }

  const validatedSettings = validateSettingsValues(settings as ProjectSettingsData);
  const migrated = JSON.stringify(validatedSettings) !== JSON.stringify(input);
  return {
    settings: validatedSettings,
    migrated
  };
}
