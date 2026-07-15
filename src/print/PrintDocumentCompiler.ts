import type { PrintLayoutSettings } from './PrintLayoutSettings';

export type PrintBreakReason = 'section' | 'h1' | 'custom-heading';

export interface PrintBreakManifestEntry {
  readonly id: string;
  readonly sectionPath: string;
  readonly reasons: readonly PrintBreakReason[];
}

export interface CompiledPrintDocument {
  /** Semantic source HTML with exactly one marker per logical page break. */
  readonly html: string;
  readonly breakManifest: readonly PrintBreakManifestEntry[];
}

/**
 * Normalises all page-break requirements before pagination.
 *
 * The paginator receives only `data-print-break-before` markers. Legacy
 * section-break elements are removed so a section marker plus an H1 can never
 * fragment twice. The first printable H1 is explicitly exempt to prevent a
 * leading blank page.
 */
export function compilePrintDocument(sourceHtml: string, layout: PrintLayoutSettings): CompiledPrintDocument {
  const sections = splitSections(sourceHtml);
  const layoutByPath = new Map(layout.sections.map(section => [section.path, section]));
  const customBreakIds = new Set(
    layout.specialHeadings.filter(heading => heading.breakBefore).map(heading => heading.id)
  );
  const manifest: PrintBreakManifestEntry[] = [];
  let breakSequence = 0;
  const headingCounters = [0, 0, 0, 0, 0, 0];

  const compiled = sections.map((section, sectionIndex) => {
    const sectionRule = layoutByPath.get(section.path);
    const body = removeLegacySectionBreaks(section.body);
    const headings = findHeadings(body);
    const firstH1 = headings.find(heading => heading.level === 1);
    const sectionRequiresBreak = sectionIndex > 0 && sectionRule?.requiresPageBreak === true;
    const reasonsByHeading = new Map<number, Set<PrintBreakReason>>();
    let sectionReasons = new Set<PrintBreakReason>();

    if (sectionRequiresBreak) {
      if (firstH1) addReason(reasonsByHeading, firstH1.index, 'section');
      else sectionReasons.add('section');
    }

    headings.forEach(heading => {
      const isFirstPrintableH1 = heading.level === 1
        && sectionIndex === 0
        && isFirstPrintableElement(body, heading.start);
      if (heading.level === 1 && !isFirstPrintableH1) {
        addReason(reasonsByHeading, heading.index, 'h1');
      }
      if (heading.specialHeadingId && customBreakIds.has(heading.specialHeadingId) && !isFirstPrintableH1) {
        addReason(reasonsByHeading, heading.index, 'custom-heading');
      }
    });

    const markedBody = body.replace(HEADING_OPEN_TAG, (tag: string) => {
      const heading = headings.shift();
      if (!heading) return tag;
      const reasons = reasonsByHeading.get(heading.index);
      if (!reasons?.size) return tag;
      const id = `break-${++breakSequence}`;
      manifest.push({ id, sectionPath: section.path, reasons: [...reasons] });
      return addAttributes(tag, {
        'data-print-break-before': 'true',
        'data-print-break-id': id
      });
    });

    let openingTag = section.openingTag;
    if (sectionReasons.size) {
      const id = `break-${++breakSequence}`;
      manifest.push({ id, sectionPath: section.path, reasons: [...sectionReasons] });
      openingTag = addAttributes(openingTag, {
        'data-print-break-before': 'true',
        'data-print-break-id': id
      });
    }
    const numberedBody = readAttribute(section.openingTag, 'data-number-headings') === 'true'
      ? materializeHeadingNumbers(markedBody, headingCounters)
      : markedBody;
    return `${openingTag}${markImageOnlyParagraphs(numberedBody)}${section.closingTag}`;
  });

  return {
    html: `<article class="clear-writer-print-content">${materializeTableOfContents(materializeSpecialHeadings(compiled.join(''), layout), layout)}</article>`,
    breakManifest: manifest
  };
}

type ParsedSection = {
  path: string;
  openingTag: string;
  body: string;
  closingTag: string;
};

type Heading = {
  index: number;
  start: number;
  level: number;
  specialHeadingId: string | null;
};

const SECTION_OPEN_TAG = /<div\b(?=[^>]*\bclass=(?:"[^"]*\bdocument-section\b[^"]*"|'[^']*\bdocument-section\b[^']*'))[^>]*>/gi;
const DIV_TAG = /<\/?div\b[^>]*>/gi;
const HEADING_OPEN_TAG = /<h([1-6])\b([^>]*)>/gi;
const LEGACY_SECTION_BREAK = /<div\b(?=[^>]*\bclass=(?:"[^"]*\bsection-break\b[^"]*"|'[^']*\bsection-break\b[^']*'))[^>]*>[\s\S]*?<\/div\s*>/gi;
const IMAGE_ONLY_PARAGRAPH = /<p\b([^>]*)>\s*(<img\b(?=[^>]*\bdata-image-source(?:=|\s|>))[^>]*>)\s*<\/p>/gi;
const SPECIAL_HEADING_OPEN_TAG = /<h([1-6])\b(?=[^>]*\bclass=(?:"[^"]*\bspecial-heading\b[^"]*"|'[^']*\bspecial-heading\b[^']*'))[^>]*>/gi;
const HEADING_OPEN_TAG_WITH_LEVEL = /<h([1-6])\b([^>]*)>/gi;
const TOC_PLACEHOLDER = /<div\b(?=[^>]*\bclass=(?:"[^"]*\btoc-placeholder\b[^"]*"|'[^']*\btoc-placeholder\b[^']*'))[^>]*>\s*<\/div>/gi;

function splitSections(html: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let match: RegExpExecArray | null;
  while ((match = SECTION_OPEN_TAG.exec(html)) !== null) {
    const openingTag = match[0];
    const closingStart = findMatchingDivClose(html, match.index);
    if (closingStart === -1) throw new Error('Print document contains an unclosed document section.');
    const closingTag = '</div>';
    const path = readAttribute(openingTag, 'data-section-path');
    if (!path) throw new Error('Print document section is missing its source path.');
    sections.push({
      path: decodeHtml(path),
      openingTag,
      body: html.slice(match.index + openingTag.length, closingStart),
      closingTag
    });
    SECTION_OPEN_TAG.lastIndex = closingStart + closingTag.length;
  }
  if (sections.length === 0) throw new Error('Print document contains no document sections.');
  return sections;
}

function findMatchingDivClose(html: string, openStart: number): number {
  DIV_TAG.lastIndex = openStart;
  let depth = 0;
  let tag: RegExpExecArray | null;
  while ((tag = DIV_TAG.exec(html)) !== null) {
    if (tag.index === openStart) {
      depth = 1;
      continue;
    }
    if (tag[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return tag.index;
    } else if (!tag[0].endsWith('/>')) {
      depth += 1;
    }
  }
  return -1;
}

function removeLegacySectionBreaks(html: string): string {
  return html.replace(LEGACY_SECTION_BREAK, '');
}

/** Annotate image-only blocks without relying on the unsupported :has() CSS selector. */
function markImageOnlyParagraphs(html: string): string {
  return html.replace(IMAGE_ONLY_PARAGRAPH, (_match, attributes: string, image: string) => {
    const openingTag = `<p${attributes}>`;
    return `${addClass(openingTag, 'clear-writer-print-image-block')}${image}</p>`;
  });
}

/** Materialise special-heading counters in the export source, not the live preview. */
function materializeSpecialHeadings(html: string, layout: PrintLayoutSettings): string {
  const definitions = new Map(layout.specialHeadings.map(definition => [definition.id, definition]));
  const counters = new Map(layout.specialHeadings.map(definition => [definition.id, definition.counterStart - 1]));
  return html.replace(SPECIAL_HEADING_OPEN_TAG, (tag: string) => {
    const id = readAttribute(tag, 'data-special-heading-id');
    if (!id) return tag;
    const definition = definitions.get(id);
    if (!definition) return tag;
    const next = (counters.get(id) ?? definition.counterStart - 1) + 1;
    counters.set(id, next);
    const prefix = definition.counterPrefix || `${definition.counterLabel || ''}${definition.counterLabel ? ' ' : ''}`;
    const marker = `<span class="special-heading-number" aria-hidden="true">${escapeHtml(`${prefix}${next}${definition.counterSuffix || ''} `)}</span>`;
    return `${addAttributes(tag, { style: specialHeadingStyle(definition) })}${marker}`;
  });
}

function specialHeadingStyle(definition: PrintLayoutSettings['specialHeadings'][number]): string {
  return [
    `font-family:${cssInlineString(definition.fontFamily)}!important`,
    `font-size:${definition.fontSize}pt!important`,
    `color:${definition.color}!important`,
    `font-weight:${definition.isBold ? 'bold' : 'normal'}!important`,
    `font-style:${definition.isItalic ? 'italic' : 'normal'}!important`,
    `text-transform:${definition.isAllCaps ? 'uppercase' : 'none'}!important`,
    `line-height:${definition.lineHeight}!important`,
    `margin-top:${definition.marginTop}pt!important`,
    `margin-bottom:${definition.marginBottom}pt!important`
  ].join(';');
}

function cssInlineString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f;{}]/g, ' ')}"`;
}

/** Match preview numbering for opted-in sections before Paged.js consumes the source. */
function materializeHeadingNumbers(html: string, counters: number[]): string {
  return html.replace(HEADING_OPEN_TAG_WITH_LEVEL, (tag: string, rawLevel: string) => {
    if (/\bclass=(?:"[^"]*\bspecial-heading\b[^"]*"|'[^']*\bspecial-heading\b[^']*')/i.test(tag)) return tag;
    const level = Number(rawLevel);
    counters[level - 1] += 1;
    counters.fill(0, level);
    const number = counters.slice(0, level).join('.');
    return `${tag}<span class="heading-number" aria-hidden="true">${number}. </span>`;
  });
}

/** Build the TOC before pagination; it must not depend on preview-only DOM work. */
function materializeTableOfContents(html: string, layout: PrintLayoutSettings): string {
  if (!TOC_PLACEHOLDER.test(html)) return html;
  TOC_PLACEHOLDER.lastIndex = 0;
  const maxLevel = Math.min(6, Math.max(1, Math.trunc(layout.toc?.maxLevel ?? 6)));
  const entries: Array<{ id: string; level: number; label: string }> = [];
  let headingIndex = 0;
  const sections = splitSections(html).map(section => {
    if (readAttribute(section.openingTag, 'data-include-in-toc') !== 'true') return section;
    const body = section.body.replace(HEADING_OPEN_TAG_WITH_LEVEL, (tag: string, rawLevel: string, _attributes: string, offset: number) => {
      const level = Number(rawLevel);
      if (level > maxLevel) return tag;
      const special = /\bclass=(?:"[^"]*\bspecial-heading\b[^"]*"|'[^']*\bspecial-heading\b[^']*')/i.test(tag);
      if (special && readAttribute(tag, 'data-include-in-toc') === 'false') return tag;
      const id = readAttribute(tag, 'id') || `heading-toc-${headingIndex}`;
      headingIndex += 1;
      const end = new RegExp(`</h${level}\\s*>`, 'i');
      const following = section.body.slice(offset + tag.length);
      const headingBody = following.split(end, 1)[0] || '';
      entries.push({ id, level, label: decodeHtml(stripHtml(headingBody)).trim() });
      return addAttributes(tag, { id });
    });
    return { ...section, body };
  });
  const rebuilt = sections.map(section => `${section.openingTag}${section.body}${section.closingTag}`).join('');
  const toc = `<nav class="table-of-contents" aria-label="Table of contents"><ul class="toc-list">${entries.map(entry =>
    `<li class="toc-item toc-level-${entry.level}"><a class="toc-link" href="#${escapeAttribute(entry.id)}"><span class="toc-label">${escapeHtml(entry.label)}</span><span class="toc-leader" aria-hidden="true"></span></a></li>`
  ).join('')}</ul></nav>`;
  return rebuilt.replace(TOC_PLACEHOLDER, toc);
}

function findHeadings(html: string): Heading[] {
  const headings: Heading[] = [];
  HEADING_OPEN_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEADING_OPEN_TAG.exec(html)) !== null) {
    headings.push({
      index: headings.length,
      start: match.index,
      level: Number(match[1]),
      specialHeadingId: readAttribute(match[0], 'data-special-heading-id')
    });
  }
  return headings;
}

function isFirstPrintableElement(html: string, headingStart: number): boolean {
  const prefix = html.slice(0, headingStart)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, '')
    .trim();
  return prefix.length === 0;
}

function addReason(target: Map<number, Set<PrintBreakReason>>, index: number, reason: PrintBreakReason): void {
  const reasons = target.get(index) ?? new Set<PrintBreakReason>();
  reasons.add(reason);
  target.set(index, reasons);
}

function addAttributes(tag: string, values: Record<string, string>): string {
  const attrs = Object.entries(values)
    .filter(([name]) => !new RegExp(`\\s${name}=`, 'i').test(tag))
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  return tag.replace(/>$/, `${attrs}>`);
}

function addClass(tag: string, className: string): string {
  const classMatch = tag.match(/\bclass=("([^"]*)"|'([^']*)')/i);
  if (!classMatch) return tag.replace(/>$/, ` class="${className}">`);
  const existing = classMatch[2] ?? classMatch[3] ?? '';
  if (existing.split(/\s+/).includes(className)) return tag;
  return tag.replace(classMatch[0], `class="${escapeAttribute(`${existing} ${className}`.trim())}"`);
}

function readAttribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escaped}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '') : null;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

function decodeHtml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}
