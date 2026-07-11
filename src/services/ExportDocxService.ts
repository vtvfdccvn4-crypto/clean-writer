import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  Bookmark,
  InternalHyperlink,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType,
  WidthType,
  Header,
  Footer,
  PageNumber,
  SectionType
} from 'docx';
import type { PageSetup, TypographySetup, ListSetup, TableSetup, ProjectMetadata, TableStyle } from '../types';
import { parseMarkdownImages } from '../images/markdownImages';

export interface ExportDocxDependencies {
  parseHtml(html: string): ParentNode;
  fetchImage(src: string): Promise<ArrayBuffer>;
  getImageDimensions(src: string): Promise<{ width: number; height: number }>;
  resolveImageSource?(src: string): string;
}

type ParagraphChild = TextRun | InternalHyperlink | ExternalHyperlink | ImageRun;

interface ConvertContext {
  renderedAny: boolean;
  lastWasSectionBreak: boolean;
  listLevel: number;
}

// 1 mm = 1440 / 25.4 = 56.6929 twips (1/20th of a point)
function mmToTwip(mm: number): number {
  return Math.round(mm * 56.6929);
}

function normalizeDocxColor(value?: string): string | undefined {
  if (!value) return undefined;
  const color = value.trim();
  const hex = color.match(/^#?([0-9a-f]{6})$/i);
  if (hex) return hex[1].toUpperCase();
  const shortHex = color.match(/^#?([0-9a-f]{3})$/i);
  if (shortHex) {
    return shortHex[1].split('').map(character => character.repeat(2)).join('').toUpperCase();
  }
  const rgb = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,[^)]*)?\)$/i);
  if (!rgb) return undefined;
  return rgb.slice(1, 4)
    .map(component => Math.max(0, Math.min(255, Math.round(Number(component)))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Replaces project metadata placeholders (e.g. ${author}) in header/footer cell text
 */
function resolveHeaderFooterText(content: string, metadata: ProjectMetadata): string {
  let formatted = content || '';
  if (metadata) {
    formatted = formatted
      .replace(/\$\{author\}/g, metadata.author || '')
      .replace(/\$\{documentTitle\}/g, metadata.documentTitle || '')
      .replace(/\$\{documentName\}/g, metadata.documentName || '')
      .replace(/\$\{documentNumber\}/g, metadata.documentNumber || '')
      .replace(/\$\{documentRevision\}/g, metadata.documentRevision || '')
      .replace(/\$\{documentType\}/g, metadata.documentType || '')
      .replace(/\$\{productName\}/g, metadata.productName || '')
      .replace(/\$\{productModule\}/g, metadata.productModule || '')
      .replace(/\$\{productVersion\}/g, metadata.productVersion || '');
  }
  return formatted;
}

function parseInlineStyle(styleStr: string | null): Record<string, string> {
  const styles: Record<string, string> = {};
  if (!styleStr) return styles;
  const parts = styleStr.split(';');
  parts.forEach((part) => {
    const colonIdx = part.indexOf(':');
    if (colonIdx > 0) {
      const key = part.substring(0, colonIdx).trim().toLowerCase();
      const val = part.substring(colonIdx + 1).trim();
      styles[key] = val;
    }
  });
  return styles;
}

function getOrderedListPrefix(index: number, level: number, delimiter: 'period' | 'paren'): string {
  const getAlpha = (idx: number) => {
    let code = '';
    let temp = idx;
    while (temp >= 0) {
      code = String.fromCharCode((temp % 26) + 97) + code;
      temp = Math.floor(temp / 26) - 1;
    }
    return code;
  };

  const getRoman = (idx: number) => {
    const romanNumeralMap = [
      { value: 10, numeral: 'x' },
      { value: 9, numeral: 'ix' },
      { value: 5, numeral: 'v' },
      { value: 4, numeral: 'iv' },
      { value: 1, numeral: 'i' }
    ];
    let num = idx + 1;
    let result = '';
    for (const { value, numeral } of romanNumeralMap) {
      while (num >= value) {
        result += numeral;
        num -= value;
      }
    }
    return result;
  };

  const suffix = delimiter === 'paren' ? ') ' : '. ';
  const levelMod = level % 3;
  if (levelMod === 0) {
    return `${index + 1}${suffix}`;
  } else if (levelMod === 1) {
    return `${getAlpha(index)}${suffix}`;
  } else {
    return `${getRoman(index)}${suffix}`;
  }
}

/**
 * Parses inline HTML elements recursively to build flat runs/links for a docx Paragraph.
 */
function parseInlineChildren(
  node: Node,
  currentStyles: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  },
  dependencies: ExportDocxDependencies,
  imageCache: Map<string, { buffer: ArrayBuffer; width: number; height: number }>,
  maxBodyWidthPx: number
): ParagraphChild[] {
  const children: ParagraphChild[] = [];

  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) { // TEXT_NODE
      const text = child.textContent || '';
      if (text) {
        children.push(new TextRun({
          text,
          bold: currentStyles.bold || undefined,
          italics: currentStyles.italic || undefined,
          color: normalizeDocxColor(currentStyles.color),
          font: currentStyles.fontFamily || undefined,
          size: currentStyles.fontSize ? currentStyles.fontSize * 2 : undefined, // half-points
          underline: currentStyles.underline ? {} : undefined
        }));
      }
    } else if (child.nodeType === 1) { // ELEMENT_NODE
      const el = child as Element;
      const tagName = el.tagName.toLowerCase();

      if (tagName === 'ul' || tagName === 'ol') {
        return; // skip nested lists inside inline children parsing
      }

      if (tagName === 'a') {
        const href = el.getAttribute('href') || '';
        const linkRuns = parseInlineChildren(el, {
          ...currentStyles,
          color: '0563C1', // blue link
          underline: true
        }, dependencies, imageCache, maxBodyWidthPx) as TextRun[];

        if (href.startsWith('#')) {
          children.push(new InternalHyperlink({
            children: linkRuns,
            anchor: href.substring(1)
          }));
        } else {
          children.push(new ExternalHyperlink({
            children: linkRuns,
            link: href
          }));
        }
      } else if (tagName === 'img') {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        const cached = imageCache.get(src);
        if (cached) {
          let width = cached.width;
          let height = cached.height;
          const isIcon = el.classList.contains('custom-block-icon');
          if (isIcon) {
            const maxHeight = (currentStyles.fontSize || 11) * 1.3;
            if (height > maxHeight) {
              const scale = maxHeight / height;
              width *= scale;
              height = maxHeight;
            }
          } else if (width > maxBodyWidthPx) {
            const scale = maxBodyWidthPx / width;
            width = maxBodyWidthPx;
            height *= scale;
          }
          children.push(new ImageRun({
            data: cached.buffer,
            transformation: { width, height },
            altText: { name: alt, description: alt, title: alt }
          }));
        }
      } else {
        const newStyles = { ...currentStyles };
        if (tagName === 'strong' || tagName === 'b') newStyles.bold = true;
        if (tagName === 'em' || tagName === 'i') newStyles.italic = true;
        if (tagName === 'u') newStyles.underline = true;

        if (tagName === 'span') {
          // Narrow Element to HTMLElement to access style property
          const htmlEl = el as HTMLElement;
          const colorAttr = el.getAttribute('color');
          const styleColor = htmlEl.style ? htmlEl.style.color : undefined;
          const color = colorAttr || styleColor;
          if (color) {
            newStyles.color = normalizeDocxColor(color);
          }
        }

        children.push(...parseInlineChildren(el, newStyles, dependencies, imageCache, maxBodyWidthPx));
      }
    }
  });

  return children;
}

/**
 * Translates top-level HTML block nodes to their equivalent docx elements.
 */
function convertBlockNodeToDocx(
  el: Element,
  pageSetup: PageSetup,
  typographySetup: TypographySetup,
  listSetup: ListSetup,
  tableSetup: TableSetup,
  imageCache: Map<string, { buffer: ArrayBuffer; width: number; height: number }>,
  dependencies: ExportDocxDependencies,
  context: ConvertContext
): any {
  const tagName = el.tagName.toLowerCase();
  const pStyle = typographySetup.paragraph;
  const maxBodyWidthPx = Math.max(
    1,
    (pageSetup.paperWidth - pageSetup.marginLeft - pageSetup.marginRight) * (96 / 25.4)
  );

  switch (tagName) {
    case 'p': {
      const runs = parseInlineChildren(el, {
        fontFamily: pStyle.fontFamily,
        fontSize: pStyle.fontSize,
        color: pStyle.color.startsWith('#') ? pStyle.color.substring(1) : pStyle.color
      }, dependencies, imageCache, maxBodyWidthPx);

      if (context) {
        context.renderedAny = true;
        context.lastWasSectionBreak = false;
      }

      return new Paragraph({
        children: runs,
        spacing: {
          line: Math.round(pStyle.lineHeight * 240),
          before: mmToTwip(pStyle.marginTop / 3.78), // Approximate px to mm conversion
          after: mmToTwip(pStyle.marginBottom / 3.78)
        }
      });
    }

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const levelNum = Number(tagName.substring(1));
      const headingKey = `h${levelNum}` as keyof TypographySetup;
      const hStyle = typographySetup[headingKey] || pStyle;

      const runs = parseInlineChildren(el, {
        fontFamily: hStyle.fontFamily,
        fontSize: hStyle.fontSize,
        color: hStyle.color.startsWith('#') ? hStyle.color.substring(1) : hStyle.color,
        bold: hStyle.isBold,
        italic: hStyle.isItalic
      }, dependencies, imageCache, maxBodyWidthPx);

      const headingLevels = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
        HeadingLevel.HEADING_6
      ];

      const id = el.getAttribute('id');
      const paragraphChildren = id ? [new Bookmark({ id, children: runs })] : runs;

      // H1 automatic page break logic
      let pageBreakBefore = undefined;
      if (tagName === 'h1' && context) {
        if (context.renderedAny && !context.lastWasSectionBreak) {
          pageBreakBefore = true;
        }
      }

      if (context) {
        context.renderedAny = true;
        context.lastWasSectionBreak = false;
      }

      return new Paragraph({
        children: paragraphChildren as any,
        heading: headingLevels[levelNum - 1],
        pageBreakBefore,
        spacing: {
          before: mmToTwip(hStyle.marginTop / 3.78),
          after: mmToTwip(hStyle.marginBottom / 3.78)
        }
      });
    }

    case 'ul': {
      const paragraphs: Paragraph[] = [];
      const currentLevel = context ? context.listLevel : 0;

      const marker = el.getAttribute('data-marker') || 'asterisk';
      let listStyle = listSetup?.ulAsterisk;
      if (marker === 'dash') listStyle = listSetup?.ulDash;
      if (marker === 'plus') listStyle = listSetup?.ulPlus;
      if (!listStyle) {
        listStyle = {
          fontFamily: pStyle.fontFamily,
          fontSize: pStyle.fontSize,
          color: pStyle.color,
          isBold: false,
          isItalic: false,
          bulletIcon: '•',
          bulletColor: pStyle.color,
          marginLeft: 18,
          paddingLeft: 18
        };
      }

      Array.from(el.children).forEach((li) => {
        if (li.tagName.toLowerCase() !== 'li') return;
        const runs = parseInlineChildren(li, {
          fontFamily: listStyle.fontFamily || pStyle.fontFamily,
          fontSize: listStyle.fontSize || pStyle.fontSize,
          color: (listStyle.color || pStyle.color).startsWith('#') ? (listStyle.color || pStyle.color).substring(1) : (listStyle.color || pStyle.color),
          bold: listStyle.isBold,
          italic: listStyle.isItalic
        }, dependencies, imageCache, maxBodyWidthPx);

        const indentPt = listStyle.marginLeft + listStyle.paddingLeft;
        const indentTwips = Math.round((indentPt || 36) * 20 * (currentLevel + 1));

        const markerRun = new TextRun({
          text: `${listStyle.bulletIcon || '•'} `,
          font: listStyle.fontFamily || pStyle.fontFamily,
          size: (listStyle.fontSize || pStyle.fontSize) * 2,
          color: (listStyle.bulletColor || listStyle.color || pStyle.color).replace(/^#/, '')
        });
        paragraphs.push(new Paragraph({
          children: [markerRun, ...runs],
          indent: {
            left: indentTwips,
            hanging: Math.max(0, Math.round((listStyle.paddingLeft || 0) * 20))
          }
        }));

        if (context) {
          context.renderedAny = true;
          context.lastWasSectionBreak = false;
        }

        // Process nested list elements
        Array.from(li.children).forEach((child) => {
          const childTag = child.tagName.toLowerCase();
          if (childTag === 'ul' || childTag === 'ol') {
            const nextContext = { ...context, listLevel: currentLevel + 1 };
            const nestedBlocks = convertBlockNodeToDocx(
              child, pageSetup, typographySetup, listSetup, tableSetup, imageCache, dependencies, nextContext
            );
            if (nestedBlocks) {
              if (Array.isArray(nestedBlocks)) {
                paragraphs.push(...nestedBlocks);
              } else {
                paragraphs.push(nestedBlocks);
              }
            }
          }
        });
      });
      return paragraphs;
    }

    case 'ol': {
      const paragraphs: Paragraph[] = [];
      const currentLevel = context ? context.listLevel : 0;

      const marker = el.getAttribute('data-marker') || 'period';
      let listStyle = marker === 'paren' ? listSetup?.olParen : listSetup?.ol;
      if (!listStyle) {
        listStyle = {
          fontFamily: pStyle.fontFamily,
          fontSize: pStyle.fontSize,
          color: pStyle.color,
          isBold: false,
          isItalic: false,
          bulletIcon: '1.',
          bulletColor: pStyle.color,
          marginLeft: 18,
          paddingLeft: 18
        };
      }

      Array.from(el.children).forEach((li, idx) => {
        if (li.tagName.toLowerCase() !== 'li') return;

        const prefixText = getOrderedListPrefix(idx, currentLevel, marker as any);
        const prefixRun = new TextRun({
          text: prefixText,
          font: listStyle.fontFamily || pStyle.fontFamily,
          size: (listStyle.fontSize || pStyle.fontSize) * 2,
          bold: true,
          color: (listStyle.color || pStyle.color).startsWith('#') ? (listStyle.color || pStyle.color).substring(1) : (listStyle.color || pStyle.color)
        });

        const runs = parseInlineChildren(li, {
          fontFamily: listStyle.fontFamily || pStyle.fontFamily,
          fontSize: listStyle.fontSize || pStyle.fontSize,
          color: (listStyle.color || pStyle.color).startsWith('#') ? (listStyle.color || pStyle.color).substring(1) : (listStyle.color || pStyle.color),
          bold: listStyle.isBold,
          italic: listStyle.isItalic
        }, dependencies, imageCache, maxBodyWidthPx);

        const indentPt = listStyle.marginLeft + listStyle.paddingLeft;
        const indentTwips = Math.round((indentPt || 36) * 20 * (currentLevel + 1));

        paragraphs.push(new Paragraph({
          children: [prefixRun, ...runs],
          indent: { left: indentTwips }
        }));

        if (context) {
          context.renderedAny = true;
          context.lastWasSectionBreak = false;
        }

        // Process nested lists
        Array.from(li.children).forEach((child) => {
          const childTag = child.tagName.toLowerCase();
          if (childTag === 'ul' || childTag === 'ol') {
            const nextContext = { ...context, listLevel: currentLevel + 1 };
            const nestedBlocks = convertBlockNodeToDocx(
              child, pageSetup, typographySetup, listSetup, tableSetup, imageCache, dependencies, nextContext
            );
            if (nestedBlocks) {
              if (Array.isArray(nestedBlocks)) {
                paragraphs.push(...nestedBlocks);
              } else {
                paragraphs.push(nestedBlocks);
              }
            }
          }
        });
      });
      return paragraphs;
    }

    case 'img': {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      const cached = imageCache.get(src);
      if (!cached) return null;

      let width = cached.width;
      let height = cached.height;

      // Scale to fit margins
      const maxBodyWidthPx = (pageSetup.paperWidth - pageSetup.marginLeft - pageSetup.marginRight) * (96 / 25.4);
      if (width > maxBodyWidthPx) {
        const scale = maxBodyWidthPx / width;
        width = maxBodyWidthPx;
        height = height * scale;
      }

      if (context) {
        context.renderedAny = true;
        context.lastWasSectionBreak = false;
      }

      return new Paragraph({
        children: [
          new ImageRun({
            data: cached.buffer,
            transformation: { width, height },
            altText: { name: alt, description: alt, title: alt }
          })
        ],
        alignment: AlignmentType.CENTER
      });
    }

    case 'table': {
      const defaultTableStyle: TableStyle = {
        fontFamily: 'Calibri',
        fontSize: 10,
        headerTextColor: '#000000',
        headerBackground: '#F2F2F2',
        headerBold: true,
        bodyTextColor: '#333333',
        bodyBackground: '#FFFFFF',
        alternateRowColor: '#F9F9F9',
        borderColor: '#D3D3D3',
        borderWidth: 1,
        cellPadding: 6,
        marginTop: 0,
        marginBottom: 12
      };

      const dataTableStyle = el.getAttribute('data-table-style') || '1';
      const tableStyleKey = `table${dataTableStyle}` as 'table1' | 'table2';
      const tStyle = (tableSetup && tableSetup[tableStyleKey]) || defaultTableStyle;

      const rows: TableRow[] = [];
      let bodyRowIndex = 0;
      const trElements = Array.from(el.querySelectorAll('tr'));

      trElements.forEach((tr) => {
        const cells: TableCell[] = [];
        const tdElements = Array.from(tr.children);
        const isHeader = tdElements.some(cell => cell.tagName.toLowerCase() === 'th');
        const currentBodyRowIndex = isHeader ? -1 : bodyRowIndex++;

        tdElements.forEach((td) => {
          const cellBlocks: Paragraph[] = [];
          
          const cellFontFamily = tStyle.fontFamily || pStyle.fontFamily;
          const cellFontSize = tStyle.fontSize || pStyle.fontSize;
          const cellColor = isHeader ? (tStyle.headerTextColor || '#000000') : (tStyle.bodyTextColor || '#333333');
          const cellBold = isHeader ? tStyle.headerBold : undefined;

          if (td.children.length === 0) {
            const runs = parseInlineChildren(td, {
              fontFamily: cellFontFamily,
              fontSize: cellFontSize,
              color: cellColor.startsWith('#') ? cellColor.substring(1) : cellColor,
              bold: cellBold
            }, dependencies, imageCache, maxBodyWidthPx);
            cellBlocks.push(new Paragraph({ children: runs }));
          } else {
            Array.from(td.children).forEach((child) => {
              const childBlock = convertBlockNodeToDocx(
                child, pageSetup, typographySetup, listSetup, tableSetup, imageCache, dependencies, context
              );
              if (childBlock) {
                if (Array.isArray(childBlock)) {
                  cellBlocks.push(...childBlock);
                } else {
                  cellBlocks.push(childBlock);
                }
              }
            });
          }

          let shadingFill = tStyle.bodyBackground || '#FFFFFF';
          if (isHeader) {
            shadingFill = tStyle.headerBackground || '#F2F2F2';
          } else if (currentBodyRowIndex % 2 === 1 && tStyle.alternateRowColor) {
            shadingFill = tStyle.alternateRowColor;
          }
          
          if (shadingFill && shadingFill.startsWith('#')) {
            shadingFill = shadingFill.substring(1);
          }

          const paddingTwips = mmToTwip((tStyle.cellPadding || 6) / 3.78);
          const borderStyle = {
            style: 'single',
            size: (tStyle.borderWidth || 1) * 8, // 1/8th of a pt
            color: (tStyle.borderColor || '#D3D3D3').startsWith('#') ? (tStyle.borderColor || '#D3D3D3').substring(1) : (tStyle.borderColor || '#D3D3D3')
          };

          cells.push(new TableCell({
            children: cellBlocks,
            shading: shadingFill ? { fill: shadingFill } : undefined,
            margins: {
              top: paddingTwips,
              bottom: paddingTwips,
              left: paddingTwips,
              right: paddingTwips
            },
            borders: {
              top: borderStyle,
              bottom: borderStyle,
              left: borderStyle,
              right: borderStyle
            } as any
          }));
        });

        rows.push(new TableRow({ children: cells }));
      });

      if (context) {
        context.renderedAny = true;
        context.lastWasSectionBreak = false;
      }

      const table = new Table({
        rows,
        width: {
          size: 100,
          type: WidthType.PERCENTAGE
        }
      });
      const blocks: Array<Paragraph | Table> = [];
      if (tStyle.marginTop > 0) {
        blocks.push(new Paragraph({ spacing: { after: Math.round(tStyle.marginTop * 20) } }));
      }
      blocks.push(table);
      if (tStyle.marginBottom > 0) {
        blocks.push(new Paragraph({ spacing: { before: Math.round(tStyle.marginBottom * 20) } }));
      }
      return blocks;
    }

    case 'nav': {
      // Table of Contents static generation
      if (el.classList.contains('table-of-contents')) {
        const paragraphs: Paragraph[] = [];
        const liElements = Array.from(el.querySelectorAll('li.toc-item'));

        liElements.forEach((li) => {
          let level = 1;
          const className = li.getAttribute('class') || '';
          const match = className.match(/toc-level-(\d+)/);
          if (match) {
            level = Number(match[1]);
          }

          const a = li.querySelector('a');
          const labelEl = li.querySelector('.toc-label');
          if (a && labelEl) {
            const href = a.getAttribute('href') || '';
            const anchor = href.startsWith('#') ? href.substring(1) : href;
            const labelText = labelEl.textContent || '';

            const linkRuns = [
              new TextRun({
                text: labelText,
                font: pStyle.fontFamily,
                size: pStyle.fontSize * 2,
                color: '0563C1', // standard hyperlink blue
                underline: {}
              })
            ];

            paragraphs.push(new Paragraph({
              children: [
                new InternalHyperlink({
                  children: linkRuns,
                  anchor: anchor
                })
              ],
              indent: { left: mmToTwip(level * 4) },
              spacing: { before: mmToTwip(1), after: mmToTwip(1) }
            }));
          }
        });

        if (context) {
          context.renderedAny = true;
          context.lastWasSectionBreak = false;
        }

        return paragraphs;
      }
      return null;
    }

    case 'div': {
      if (el.classList.contains('custom-block-style')) {
        const inlineStyles = parseInlineStyle(el.getAttribute('style'));
        const fontFamily = inlineStyles['font-family']?.replace(/['"]/g, '') || pStyle.fontFamily;
        const fontSizeStr = inlineStyles['font-size'];
        const fontSize = fontSizeStr ? parseFloat(fontSizeStr) : pStyle.fontSize;
        const colorStr = inlineStyles['color'];
        const color = colorStr ? (colorStr.startsWith('#') ? colorStr.substring(1) : colorStr) : pStyle.color;
        const bold = inlineStyles['font-weight'] === 'bold';
        const italic = inlineStyles['font-style'] === 'italic';

        const runs = parseInlineChildren(el, {
          fontFamily,
          fontSize,
          color: color.startsWith('#') ? color.substring(1) : color,
          bold,
          italic
        }, dependencies, imageCache, maxBodyWidthPx);

        const lineHeightStr = inlineStyles['line-height'];
        const lineHeight = lineHeightStr ? parseFloat(lineHeightStr) : pStyle.lineHeight;
        const marginTopStr = inlineStyles['margin-top'];
        const marginTop = marginTopStr ? parseFloat(marginTopStr) : pStyle.marginTop;
        const marginBottomStr = inlineStyles['margin-bottom'];
        const marginBottom = marginBottomStr ? parseFloat(marginBottomStr) : pStyle.marginBottom;

        if (context) {
          context.renderedAny = true;
          context.lastWasSectionBreak = false;
        }

        return new Paragraph({
          children: runs,
          spacing: {
            line: Math.round(lineHeight * 240),
            before: mmToTwip(marginTop / 3.78),
            after: mmToTwip(marginBottom / 3.78)
          }
        });
      }

      const blocks: any[] = [];
      Array.from(el.children).forEach((child) => {
        const childBlock = convertBlockNodeToDocx(
          child, pageSetup, typographySetup, listSetup, tableSetup, imageCache, dependencies, context
        );
        if (childBlock) {
          if (Array.isArray(childBlock)) {
            blocks.push(...childBlock);
          } else {
            blocks.push(childBlock);
          }
        }
      });
      return blocks;
    }

    default:
      return null;
  }
}

/**
 * Creates dynamic header/footer content with custom left/center/right formatting and variable substitution.
 */
function createHeaderFooter(
  cellLeft: any,
  cellCenter: any,
  cellRight: any,
  fontFamily: string,
  fontSize: number,
  projectMetadata: ProjectMetadata,
  imageCache: Map<string, { buffer: ArrayBuffer; width: number; height: number }>
) {
  const getRunsForCell = (cell: any) => {
    const text = resolveHeaderFooterText(cell.content, projectMetadata);
    if (!text) return [];
    const runs: any[] = [];

    const textStyle = {
      font: cell.fontFamily || fontFamily,
      size: (cell.fontSize || fontSize) * 2,
      bold: cell.isBold,
      italics: cell.isItalic,
      color: cell.color ? (cell.color.startsWith('#') ? cell.color.substring(1) : cell.color) : undefined
    };

    const appendText = (value: string) => {
      value.split(/(\{page\}|\{pages\}|\\n|<br\s*\/?>)/gi).forEach(part => {
        const lower = part.toLowerCase();
        if (lower === '{page}') {
          runs.push(new TextRun({ ...textStyle, children: [PageNumber.CURRENT] }));
        } else if (lower === '{pages}') {
          runs.push(new TextRun({ ...textStyle, children: [PageNumber.TOTAL_PAGES] }));
        } else if (lower === '\\n' || lower === '\n' || lower.startsWith('<br')) {
          runs.push(new TextRun({ ...textStyle, break: 1 }));
        } else if (part) {
          runs.push(new TextRun({ ...textStyle, text: part }));
        }
      });
    };

    let offset = 0;
    for (const match of parseMarkdownImages(text)) {
      appendText(text.slice(offset, match.start));
      const cached = imageCache.get(match.source);
      if (cached) {
        let width = cached.width;
        let height = cached.height;
        const maxHeightPx = 40;
        if (height > maxHeightPx) {
          const scale = maxHeightPx / height;
          width *= scale;
          height = maxHeightPx;
        }
        runs.push(new ImageRun({
          data: cached.buffer,
          transformation: { width, height },
          altText: { name: match.alt, description: match.alt, title: match.title || match.alt }
        }));
      }
      offset = match.end;
    }
    appendText(text.slice(offset));

    return runs;
  };

  return new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: getRunsForCell(cellLeft),
                alignment: AlignmentType.LEFT
              })
            ],
            borders: {
              top: { style: 'none', size: 0, color: 'auto' },
              bottom: { style: 'none', size: 0, color: 'auto' },
              left: { style: 'none', size: 0, color: 'auto' },
              right: { style: 'none', size: 0, color: 'auto' }
            }
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: getRunsForCell(cellCenter),
                alignment: AlignmentType.CENTER
              })
            ],
            borders: {
              top: { style: 'none', size: 0, color: 'auto' },
              bottom: { style: 'none', size: 0, color: 'auto' },
              left: { style: 'none', size: 0, color: 'auto' },
              right: { style: 'none', size: 0, color: 'auto' }
            }
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: getRunsForCell(cellRight),
                alignment: AlignmentType.RIGHT
              })
            ],
            borders: {
              top: { style: 'none', size: 0, color: 'auto' },
              bottom: { style: 'none', size: 0, color: 'auto' },
              left: { style: 'none', size: 0, color: 'auto' },
              right: { style: 'none', size: 0, color: 'auto' }
            }
          })
        ]
      })
    ],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    }
  });
}

/**
 * Primary export generator that compiles structural HTML into a docx Buffer.
 */
export async function generateDocx(
  html: string,
  pageSetup: PageSetup,
  typographySetup: TypographySetup,
  listSetup: ListSetup,
  tableSetup: TableSetup,
  projectMetadata: ProjectMetadata,
  dependencies: ExportDocxDependencies
): Promise<Uint8Array> {
  const root = dependencies.parseHtml(html);

  // 1. Scan headers/footers for markdown images
  const headerFooterImages: string[] = [];
  const addImagesFromText = (text: string) => {
    headerFooterImages.push(...parseMarkdownImages(text).map(image => image.source));
  };
  if (pageSetup.header) {
    if (pageSetup.header.left?.content) addImagesFromText(pageSetup.header.left.content);
    if (pageSetup.header.center?.content) addImagesFromText(pageSetup.header.center.content);
    if (pageSetup.header.right?.content) addImagesFromText(pageSetup.header.right.content);
  }
  if (pageSetup.footer) {
    if (pageSetup.footer.left?.content) addImagesFromText(pageSetup.footer.left.content);
    if (pageSetup.footer.center?.content) addImagesFromText(pageSetup.footer.center.content);
    if (pageSetup.footer.right?.content) addImagesFromText(pageSetup.footer.right.content);
  }

  // 2. Pre-load all images upfront (both body img elements and header/footer markdown images)
  const imageCache = new Map<string, { buffer: ArrayBuffer; width: number; height: number }>();
  const imgElements = Array.from(root.querySelectorAll('img'));
  
  const imageRequests = new Map<string, { cacheKeys: Set<string>; el?: Element }>();

  const addImageRequest = (fetchSource: string, cacheKeys: string[], el?: Element) => {
    const existing = imageRequests.get(fetchSource);
    if (existing) {
      cacheKeys.forEach(key => existing.cacheKeys.add(key));
      if (!existing.el && el) existing.el = el;
      return;
    }
    imageRequests.set(fetchSource, { cacheKeys: new Set(cacheKeys), el });
  };

  imgElements.forEach(img => {
    const src = img.getAttribute('src');
    if (src) {
      addImageRequest(src, [src], img);
    }
  });

  headerFooterImages.forEach(source => {
    const resolvedSource = dependencies.resolveImageSource?.(source) || source;
    addImageRequest(resolvedSource, [source, resolvedSource]);
  });

  await Promise.all(Array.from(imageRequests.entries()).map(async ([src, request]) => {
    try {
      const buffer = await dependencies.fetchImage(src);
      let width = 0;
      let height = 0;
      if (request.el) {
        width = Number(request.el.getAttribute('width'));
        height = Number(request.el.getAttribute('height'));
      }
      if (!width || !height) {
        const dims = await dependencies.getImageDimensions(src);
        width = dims.width;
        height = dims.height;
      }
      const cached = { buffer, width, height };
      request.cacheKeys.forEach(key => imageCache.set(key, cached));
    } catch (e) {
      console.error('[ExportDocx] Failed to pre-fetch image:', src, e);
    }
  }));

  const sectionElements = Array.from(root.querySelectorAll('.document-section'));
  const docxSections: any[] = [];

  const defaultHeaders = {
    default: new Header({
      children: [
        createHeaderFooter(
          pageSetup.header.left,
          pageSetup.header.center,
          pageSetup.header.right,
          typographySetup.paragraph.fontFamily,
          typographySetup.paragraph.fontSize,
          projectMetadata,
          imageCache
        )
      ]
    })
  };

  const defaultFooters = {
    default: new Footer({
      children: [
        createHeaderFooter(
          pageSetup.footer.left,
          pageSetup.footer.center,
          pageSetup.footer.right,
          typographySetup.paragraph.fontFamily,
          typographySetup.paragraph.fontSize,
          projectMetadata,
          imageCache
        )
      ]
    })
  };

  // Explicit blank header and footer to override inheritance in Word
  const blankHeaders = {
    default: new Header({
      children: [new Paragraph({})]
    })
  };

  const blankFooters = {
    default: new Footer({
      children: [new Paragraph({})]
    })
  };

  const docxSize = {
    width: mmToTwip(pageSetup.paperWidth),
    height: mmToTwip(pageSetup.paperHeight)
  };

  const docxMargins = {
    top: mmToTwip(pageSetup.marginTop),
    bottom: mmToTwip(pageSetup.marginBottom),
    left: mmToTwip(pageSetup.marginLeft),
    right: mmToTwip(pageSetup.marginRight)
  };

  // Convert elements section by section
  if (sectionElements.length > 0) {
    const documentContext: ConvertContext = {
      renderedAny: false,
      lastWasSectionBreak: false,
      listLevel: 0
    };
    sectionElements.forEach((sectionEl) => {
      const hideHeader = sectionEl.getAttribute('data-hide-header') === 'true';
      const hideFooter = sectionEl.getAttribute('data-hide-footer') === 'true';

      // Check if the section begins with a page break
      let startsWithBreak = false;
      const firstChild = sectionEl.firstElementChild;
      if (firstChild && firstChild.classList.contains('section-break')) {
        startsWithBreak = true;
      }

      const sectionChildren: any[] = [];
      const context: ConvertContext = {
        renderedAny: documentContext.renderedAny,
        lastWasSectionBreak: startsWithBreak,
        listLevel: 0
      };

      Array.from(sectionEl.children).forEach((child, index) => {
        if (index === 0 && startsWithBreak) {
          return; // Skip redundant page-break since section transition handles it
        }

        if (child.classList.contains('section-break')) {
          sectionChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));
          context.lastWasSectionBreak = true;
          context.renderedAny = true;
          return;
        }

        const block = convertBlockNodeToDocx(
          child, pageSetup, typographySetup, listSetup, tableSetup, imageCache, dependencies, context
        );
        if (block) {
          if (Array.isArray(block)) {
            sectionChildren.push(...block);
          } else {
            sectionChildren.push(block);
          }
        }
      });
      documentContext.renderedAny = context.renderedAny;
      documentContext.lastWasSectionBreak = context.lastWasSectionBreak;

      docxSections.push({
        headers: hideHeader ? blankHeaders : defaultHeaders,
        footers: hideFooter ? blankFooters : defaultFooters,
        properties: {
          page: {
            size: docxSize,
            margin: docxMargins
          },
          type: startsWithBreak ? SectionType.NEXT_PAGE : SectionType.CONTINUOUS
        },
        children: sectionChildren
      });
    });
  } else {
    // Fallback: If no wrappers found, parse all top level elements directly
    const children: any[] = [];
    const context: ConvertContext = {
      renderedAny: false,
      lastWasSectionBreak: false,
      listLevel: 0
    };
    Array.from(root.children).forEach((child) => {
      const block = convertBlockNodeToDocx(
        child, pageSetup, typographySetup, listSetup, tableSetup, imageCache, dependencies, context
      );
      if (block) {
        if (Array.isArray(block)) {
          children.push(...block);
        } else {
          children.push(block);
        }
      }
    });

    docxSections.push({
      headers: defaultHeaders,
      footers: defaultFooters,
      properties: {
        page: {
          size: docxSize,
          margin: docxMargins
        }
      },
      children
    });
  }

  const doc = new Document({
    title: projectMetadata.documentTitle || undefined,
    creator: projectMetadata.author || undefined,
    sections: docxSections
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
