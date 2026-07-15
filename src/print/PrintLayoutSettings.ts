import type {
  CustomBlockStyle,
  CustomStyle,
  FileNode,
  HeaderFooterCell,
  HeaderFooterRow,
  ImageSetup,
  ListSetup,
  PageSetup,
  ProjectMetadata,
  SpecialHeadingDefinition,
  TableSetup,
  TocSetup,
  TypographySetup
} from '../types';

/**
 * All data permitted to influence a PDF layout.
 *
 * This is deliberately a value object, not a view over application state.
 * The print compiler and paginator receive this frozen snapshot and must not
 * consult live settings, preview CSS, or fallback defaults.
 */
export interface PrintLayoutSettings {
  readonly paper: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly marginsMm: {
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
      readonly left: number;
    };
  };
  readonly header: Readonly<HeaderFooterRow>;
  readonly footer: Readonly<HeaderFooterRow>;
  readonly toc: Readonly<TocSetup> | null;
  readonly specialHeadings: readonly Readonly<SpecialHeadingDefinition>[];
  readonly typography: Readonly<TypographySetup>;
  readonly lists: Readonly<ListSetup>;
  readonly tables: Readonly<TableSetup>;
  readonly images: Readonly<ImageSetup>;
  readonly metadata: Readonly<ProjectMetadata>;
  readonly customStyles: readonly Readonly<CustomStyle>[];
  readonly customBlockStyles: readonly Readonly<CustomBlockStyle>[];
  readonly sections: readonly PrintSectionLayoutRule[];
}

/** Per-section print policy copied from the project explorer state. */
export interface PrintSectionLayoutRule {
  readonly path: string;
  readonly requiresPageBreak: boolean;
}

export interface CreatePrintLayoutSettingsInput {
  readonly pageSetup: PageSetup;
  readonly typographySetup: TypographySetup;
  readonly listSetup: ListSetup;
  readonly tableSetup: TableSetup;
  readonly imageSetup: ImageSetup;
  readonly projectMetadata: ProjectMetadata;
  readonly customStyles: readonly CustomStyle[];
  readonly customBlockStyles: readonly CustomBlockStyle[];
  readonly sections: readonly FileNode[];
}

/**
 * Captures the complete print contract at export start.
 *
 * Input validation intentionally rejects incomplete settings instead of
 * inventing values: project-settings normalisation is the only place where
 * defaults may be applied.
 */
export function createPrintLayoutSettings(input: CreatePrintLayoutSettingsInput): PrintLayoutSettings {
  validatePageSetup(input.pageSetup);

  const snapshot: PrintLayoutSettings = {
    paper: {
      widthMm: input.pageSetup.paperWidth,
      heightMm: input.pageSetup.paperHeight,
      marginsMm: {
        top: input.pageSetup.marginTop,
        right: input.pageSetup.marginRight,
        bottom: input.pageSetup.marginBottom,
        left: input.pageSetup.marginLeft
      }
    },
    header: cloneRow(input.pageSetup.header),
    footer: cloneRow(input.pageSetup.footer),
    toc: input.pageSetup.toc ? cloneToc(input.pageSetup.toc) : null,
    specialHeadings: input.pageSetup.specialHeadings?.map(cloneSpecialHeading) ?? [],
    typography: cloneTypography(input.typographySetup),
    lists: cloneListSetup(input.listSetup),
    tables: cloneTableSetup(input.tableSetup),
    images: { ...input.imageSetup },
    metadata: { ...input.projectMetadata },
    customStyles: input.customStyles.map(style => ({ ...style })),
    customBlockStyles: input.customBlockStyles.map(style => ({ ...style })),
    sections: input.sections
      .filter(section => !section.isDir)
      .map(section => ({
        path: section.path,
        requiresPageBreak: section.pageBreak === true
      }))
  };

  return deepFreeze(snapshot);
}

function validatePageSetup(page: PageSetup): void {
  requirePositive(page.paperWidth, 'paper width');
  requirePositive(page.paperHeight, 'paper height');
  requireNonNegative(page.marginTop, 'top margin');
  requireNonNegative(page.marginRight, 'right margin');
  requireNonNegative(page.marginBottom, 'bottom margin');
  requireNonNegative(page.marginLeft, 'left margin');
  if (page.marginLeft + page.marginRight >= page.paperWidth) {
    throw new Error('Print layout margins leave no horizontal content area.');
  }
  if (page.marginTop + page.marginBottom >= page.paperHeight) {
    throw new Error('Print layout margins leave no vertical content area.');
  }
  validateRow(page.header, 'header');
  validateRow(page.footer, 'footer');
}

function validateRow(row: HeaderFooterRow, name: string): void {
  if (!row.centerWidth?.trim()) throw new Error(`Print ${name} centre width is required.`);
  for (const zone of [row.left, row.center, row.right]) validateCell(zone, name);
}

function validateCell(cell: HeaderFooterCell, rowName: string): void {
  if (!cell.fontFamily?.trim()) throw new Error(`Print ${rowName} font family is required.`);
  requirePositive(cell.fontSize, `${rowName} font size`);
}

function requirePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Print ${name} must be greater than zero.`);
}

function requireNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Print ${name} must be zero or greater.`);
}

function cloneRow(row: HeaderFooterRow): HeaderFooterRow {
  return {
    centerWidth: row.centerWidth,
    left: { ...row.left },
    center: { ...row.center },
    right: { ...row.right }
  };
}

function cloneToc(toc: TocSetup): TocSetup {
  return {
    ...toc,
    h1: { ...toc.h1 }, h2: { ...toc.h2 }, h3: { ...toc.h3 },
    h4: { ...toc.h4 }, h5: { ...toc.h5 }, h6: { ...toc.h6 }
  };
}

function cloneSpecialHeading(heading: SpecialHeadingDefinition): SpecialHeadingDefinition {
  return { ...heading };
}

function cloneTypography(setup: TypographySetup): TypographySetup {
  return {
    paragraph: { ...setup.paragraph }, h1: { ...setup.h1 }, h2: { ...setup.h2 },
    h3: { ...setup.h3 }, h4: { ...setup.h4 }, h5: { ...setup.h5 }, h6: { ...setup.h6 }
  };
}

function cloneListSetup(setup: ListSetup): ListSetup {
  return {
    ulAsterisk: { ...setup.ulAsterisk }, ulDash: { ...setup.ulDash }, ulPlus: { ...setup.ulPlus },
    ol: { ...setup.ol }, olParen: { ...setup.olParen }
  };
}

function cloneTableSetup(setup: TableSetup): TableSetup {
  return { table1: { ...setup.table1 }, table2: { ...setup.table2 } };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
