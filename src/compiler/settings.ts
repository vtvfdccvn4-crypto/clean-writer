import type { AppStateData, CustomBlockStyle, CustomStyle, ProjectMetadata, SpecialHeadingDefinition, TypographyStyle } from '../types';

/**
 * The project settings that change how Markdown compiles. Callers pass them in,
 * so compiling depends only on its inputs and never on global app state.
 */
export interface DocumentCompileSettings {
  customStyles: readonly CustomStyle[];
  customBlockStyles: readonly CustomBlockStyle[];
  specialHeadings: readonly SpecialHeadingDefinition[];
  projectMetadata: ProjectMetadata | null;
  /** Default spacing for custom block styles that do not set their own. */
  paragraphSpacing: Pick<TypographyStyle, 'lineHeight' | 'marginTop' | 'marginBottom'>;
}

export type DocumentCompileSettingsSource = Pick<
  AppStateData,
  'customStyles' | 'customBlockStyles' | 'pageSetup' | 'projectMetadata' | 'typographySetup'
>;

// Shared so a missing list compares equal across calls (see sameDocumentCompileSettings).
const NO_ITEMS: readonly never[] = Object.freeze([]);

/** Reads the compile-relevant settings out of a project or app-state snapshot. */
export function documentCompileSettings(source: DocumentCompileSettingsSource): DocumentCompileSettings {
  return {
    customStyles: source.customStyles || NO_ITEMS,
    customBlockStyles: source.customBlockStyles || NO_ITEMS,
    specialHeadings: source.pageSetup.specialHeadings || NO_ITEMS,
    projectMetadata: source.projectMetadata ?? null,
    paragraphSpacing: source.typographySetup.paragraph
  };
}

/**
 * True when two settings objects would compile identically. App state replaces
 * each settings object when it changes, so comparing references is enough.
 */
export function sameDocumentCompileSettings(a: DocumentCompileSettings, b: DocumentCompileSettings): boolean {
  return a.customStyles === b.customStyles
    && a.customBlockStyles === b.customBlockStyles
    && a.specialHeadings === b.specialHeadings
    && a.projectMetadata === b.projectMetadata
    && a.paragraphSpacing === b.paragraphSpacing;
}
