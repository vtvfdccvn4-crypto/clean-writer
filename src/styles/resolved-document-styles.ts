import type { HeaderFooterCell, ListStyle, PageSetup, SpecialHeadingDefinition, TableStyle, TocStyle, TypographySetup } from '../types';
import { DEFAULT_BODY_FONT_FAMILY, DEFAULT_HEADER_FOOTER_FONT_FAMILY, DEFAULT_LIST_FONT_FAMILY } from '../config/font-families';

export type ResolvedTocStyle = Required<Pick<TocStyle, 'fontFamily' | 'fontSize' | 'color' | 'isBold' | 'isItalic' | 'isAllCaps'>>;
export type ResolvedTypographyStyle = Required<Pick<TypographySetup['paragraph'], 'fontFamily' | 'fontSize' | 'color' | 'isBold' | 'isItalic' | 'lineHeight' | 'marginTop' | 'marginBottom'>>;
export type ResolvedListStyle = Required<Pick<ListStyle, 'fontFamily' | 'fontSize' | 'color' | 'isBold' | 'isItalic' | 'lineHeight' | 'bulletIcon' | 'bulletColor' | 'marginLeft' | 'paddingLeft'>>;
export type ResolvedHeaderFooterCell = Required<Pick<HeaderFooterCell, 'content' | 'fontFamily' | 'fontSize' | 'color' | 'isBold' | 'isItalic'>> & Pick<HeaderFooterCell, 'horizontalAlign' | 'verticalAlign'>;
export type ResolvedTableStyle = Required<TableStyle>;
export type ResolvedSpecialHeadingStyle = Required<Pick<SpecialHeadingDefinition, 'fontFamily' | 'fontSize' | 'color' | 'isBold' | 'isItalic' | 'isAllCaps' | 'lineHeight' | 'marginTop' | 'marginBottom'>>;

function hexOr(value: string | undefined, fallback: string): string {
  return value || fallback;
}

export function resolveTypographyStyle(style: Partial<TypographySetup['paragraph']> | undefined, fallbackFamily = DEFAULT_BODY_FONT_FAMILY): ResolvedTypographyStyle {
  return {
    fontFamily: hexOr(style?.fontFamily, fallbackFamily),
    fontSize: style?.fontSize ?? 11,
    color: hexOr(style?.color, '#000000'),
    isBold: !!style?.isBold,
    isItalic: !!style?.isItalic,
    lineHeight: style?.lineHeight ?? 1.5,
    marginTop: style?.marginTop ?? 0,
    marginBottom: style?.marginBottom ?? 0
  };
}

export function resolveListStyle(style: Partial<ListStyle> | undefined, fallbackFamily = DEFAULT_LIST_FONT_FAMILY): ResolvedListStyle {
  return {
    fontFamily: hexOr(style?.fontFamily, fallbackFamily),
    fontSize: style?.fontSize ?? 11,
    color: hexOr(style?.color, '#000000'),
    isBold: !!style?.isBold,
    isItalic: !!style?.isItalic,
    lineHeight: style?.lineHeight ?? 1.6,
    bulletIcon: style?.bulletIcon ?? '•',
    bulletColor: hexOr(style?.bulletColor, hexOr(style?.color, '#000000')),
    marginLeft: style?.marginLeft ?? 20,
    paddingLeft: style?.paddingLeft ?? 8
  };
}

export function resolveTocStyle(style: Partial<TocStyle> | undefined, fallbackFamily = DEFAULT_BODY_FONT_FAMILY): ResolvedTocStyle {
  return {
    fontFamily: hexOr(style?.fontFamily, fallbackFamily),
    fontSize: style?.fontSize ?? 11,
    color: hexOr(style?.color, '#000000'),
    isBold: !!style?.isBold,
    isItalic: !!style?.isItalic,
    isAllCaps: !!style?.isAllCaps
  };
}

export function resolveHeaderFooterCell(cell: Partial<HeaderFooterCell> | undefined, fallbackFamily = DEFAULT_HEADER_FOOTER_FONT_FAMILY): ResolvedHeaderFooterCell {
  return {
    content: cell?.content ?? '',
    fontFamily: hexOr(cell?.fontFamily, fallbackFamily),
    fontSize: cell?.fontSize ?? 9,
    color: hexOr(cell?.color, '#000000'),
    isBold: !!cell?.isBold,
    isItalic: !!cell?.isItalic,
    horizontalAlign: cell?.horizontalAlign,
    verticalAlign: cell?.verticalAlign
  };
}

export function resolveTableStyle(style: Partial<TableStyle> | undefined, fallbackFamily = DEFAULT_BODY_FONT_FAMILY): ResolvedTableStyle {
  return {
    fontFamily: hexOr(style?.fontFamily, fallbackFamily),
    fontSize: style?.fontSize ?? 10,
    headerTextColor: hexOr(style?.headerTextColor, '#FFFFFF'),
    headerBackground: hexOr(style?.headerBackground, '#405A78'),
    headerBold: !!style?.headerBold,
    bodyTextColor: hexOr(style?.bodyTextColor, '#000000'),
    bodyBackground: hexOr(style?.bodyBackground, '#FFFFFF'),
    alternateRowColor: hexOr(style?.alternateRowColor, '#F2F2F2'),
    borderColor: hexOr(style?.borderColor, '#808080'),
    borderWidth: style?.borderWidth ?? 0.75,
    cellPadding: style?.cellPadding ?? 6,
    marginTop: style?.marginTop ?? 8,
    marginBottom: style?.marginBottom ?? 12
  };
}

export function resolveSpecialHeadingStyle(style: Partial<SpecialHeadingDefinition> | undefined, fallbackFamily = DEFAULT_BODY_FONT_FAMILY): ResolvedSpecialHeadingStyle {
  return {
    fontFamily: hexOr(style?.fontFamily, fallbackFamily),
    fontSize: style?.fontSize ?? 12,
    color: hexOr(style?.color, '#000000'),
    isBold: !!style?.isBold,
    isItalic: !!style?.isItalic,
    isAllCaps: !!style?.isAllCaps,
    lineHeight: style?.lineHeight ?? 1.2,
    marginTop: style?.marginTop ?? 12,
    marginBottom: style?.marginBottom ?? 6
  };
}

export function resolvePageTocStyles(pageSetup: PageSetup): Record<'h1'|'h2'|'h3'|'h4'|'h5'|'h6', ResolvedTocStyle> {
  const toc = pageSetup.toc;
  return {
    h1: resolveTocStyle(toc?.h1),
    h2: resolveTocStyle(toc?.h2),
    h3: resolveTocStyle(toc?.h3),
    h4: resolveTocStyle(toc?.h4),
    h5: resolveTocStyle(toc?.h5),
    h6: resolveTocStyle(toc?.h6)
  };
}
