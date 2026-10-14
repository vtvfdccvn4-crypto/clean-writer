export interface TextBundleFile {
  readonly path: string;
  readonly text: string;
  readonly language?: string;
}

export interface TextBundleLayout {
  readonly paper?: 'A4' | 'Letter';
  readonly marginMm?: number;
  readonly fontSizePt?: number;
  readonly lineHeight?: number;
  readonly lineNumbers?: boolean;
  readonly wrapLongLines?: boolean;
}

export interface CompileTextBundleInput {
  readonly title: string;
  readonly subtitle?: string;
  readonly files: readonly TextBundleFile[];
  readonly layout?: TextBundleLayout;
}

export interface CompiledTextBundle {
  readonly html: string;
  readonly css: string;
  readonly artifactCss: string;
  readonly identity: Readonly<{
    compiler: 'codebase-text-v2';
    paper: 'A4' | 'Letter';
    fileCount: number;
    lineNumbers: boolean;
    wrapLongLines: boolean;
  }>;
}

/** Compiles arbitrary repository text through an escaping-only trust boundary. */
export function compileTextBundle(input: CompileTextBundleInput): CompiledTextBundle {
  const title = requireValue(input.title, 'bundle title');
  if (input.files.length === 0) throw new Error('Text bundle requires at least one file.');
  const layout = normalizeLayout(input.layout);
  const fileSections = input.files.map((file, fileIndex) => compileFile(file, fileIndex, layout.lineNumbers)).join('\n');
  const index = input.files.map((file, fileIndex) =>
    `<li><a href="#source-file-${fileIndex + 1}">${escapeHtml(requireValue(file.path, 'file path'))}</a></li>`
  ).join('');
  const subtitle = input.subtitle?.trim()
    ? `<p class="document-subtitle">${escapeHtml(input.subtitle.trim())}</p>`
    : '';

  const html = `<article class="codebase-document">
  <header class="document-cover" data-pdf-anchor="cover">
    <p class="document-kicker">Source preview</p>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle}
    <p class="document-summary">${input.files.length} file${input.files.length === 1 ? '' : 's'}</p>
  </header>
  <nav class="file-index" aria-label="Files">
    <h2>Files</h2>
    <ol>${index}</ol>
  </nav>
  ${fileSections}
</article>`;

  return Object.freeze({
    html,
    css: compileCss(layout),
    artifactCss: compileArtifactCss(layout.paper),
    identity: Object.freeze({
      compiler: 'codebase-text-v2',
      paper: layout.paper,
      fileCount: input.files.length,
      lineNumbers: layout.lineNumbers,
      wrapLongLines: layout.wrapLongLines
    })
  });
}

function compileFile(file: TextBundleFile, index: number, lineNumbers: boolean): string {
  const path = requireValue(file.path, 'file path');
  const normalizedText = file.text.replace(/\r\n?/g, '\n');
  const lines = normalizedText.split('\n');
  const language = file.language?.trim();
  const lineMarkup = lines.map((line, lineIndex) => {
    const number = lineNumbers ? `<span class="source-line-number" aria-hidden="true">${lineIndex + 1}</span>` : '';
    return `<span class="source-line">${number}<span class="source-line-text">${line ? escapeHtml(line) : '&#8203;'}</span></span>`;
  }).join('');
  return `<section class="source-file" id="source-file-${index + 1}" data-pdf-anchor="source-file-${index + 1}" data-source-path="${escapeAttribute(path)}">
    <header class="source-file-header">
      <h2>${escapeHtml(path)}</h2>
      ${language ? `<span class="source-language">${escapeHtml(language)}</span>` : ''}
      <span class="source-file-meta">${lines.length} line${lines.length === 1 ? '' : 's'}</span>
    </header>
    <pre class="source-code" tabindex="0"><code>${lineMarkup}</code></pre>
  </section>`;
}

function compileCss(layout: Required<TextBundleLayout>): string {
  const paper = layout.paper === 'Letter' ? '216mm 279mm' : '210mm 297mm';
  const wrap = layout.wrapLongLines
    ? 'white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;'
    : 'white-space:pre;overflow-wrap:normal;word-break:normal;';
  const lineColumns = layout.lineNumbers ? '3.2em minmax(0, 1fr)' : 'minmax(0, 1fr)';
  return `
@page {
  size: ${paper};
  margin: ${layout.marginMm}mm;
  @bottom-center { content: counter(page); color: #667085; font: 8pt system-ui, sans-serif; }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #172033; background: #fff; }
.codebase-document { font: 10.5pt/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
.document-cover { min-height: 112mm; display: flex; flex-direction: column; justify-content: center; break-after: page; }
.document-kicker { margin: 0 0 10pt; color: #175cd3; font-size: 9pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.document-cover h1 { margin: 0; color: #101828; font-size: 28pt; line-height: 1.08; letter-spacing: -.025em; }
.document-subtitle { max-width: 42em; margin: 16pt 0 0; color: #475467; font-size: 12pt; }
.document-summary { margin: 24pt 0 0; color: #667085; font-size: 9pt; }
.file-index { break-after: page; }
.file-index h2 { margin: 0 0 14pt; font-size: 19pt; }
.file-index ol { margin: 0; padding-left: 20pt; }
.file-index li { margin: 0 0 5pt; }
.file-index a { color: #175cd3; text-decoration: none; overflow-wrap: anywhere; }
.source-file { break-before: page; }
.source-file-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 5pt 12pt; margin: 0 0 10pt; padding-bottom: 8pt; border-bottom: .6pt solid #d0d5dd; }
.source-file-header h2 { grid-column: 1; margin: 0; color: #101828; font: 700 13pt/1.3 system-ui, sans-serif; overflow-wrap: anywhere; }
.source-language { grid-column: 2; grid-row: 1; color: #175cd3; font: 700 8pt/1.3 system-ui, sans-serif; text-transform: uppercase; }
.source-file-meta { grid-column: 1 / -1; color: #667085; font: 8pt/1.3 system-ui, sans-serif; }
.source-code { margin: 0; padding: 0; border: 0; background: transparent; font: ${layout.fontSizePt}pt/${layout.lineHeight} "Cascadia Mono", "Consolas", "Courier New", monospace; tab-size: 2; ${wrap} }
.source-code code { display: block; }
.source-line { display: grid; grid-template-columns: ${lineColumns}; column-gap: 1em; min-width: 0; break-inside: avoid; }
.source-line-number { color: #98a2b3; text-align: right; user-select: none; }
.source-line-text { min-width: 0; }
`;
}

function compileArtifactCss(paper: 'A4' | 'Letter'): string {
  const size = paper === 'Letter' ? '216mm 279mm' : '210mm 297mm';
  return `
@media screen {
  html, body { min-height: 100%; background: #e9edf3; }
  .pagedjs_pages { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 24px; }
  .pagedjs_page { background: #fff; box-shadow: 0 8px 28px rgba(16, 24, 40, .16); }
}
@media print {
  @page { size: ${size}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .pagedjs_pages { display: block; padding: 0; }
  .pagedjs_page { margin: 0 !important; box-shadow: none !important; break-after: page; }
  .pagedjs_page:last-child { break-after: auto; }
}
`;
}

function normalizeLayout(layout: TextBundleLayout = {}): Required<TextBundleLayout> {
  const marginMm = layout.marginMm ?? 16;
  const fontSizePt = layout.fontSizePt ?? 8.5;
  const lineHeight = layout.lineHeight ?? 1.42;
  if (!Number.isFinite(marginMm) || marginMm < 5 || marginMm > 40) throw new Error('Page margin must be between 5 and 40 mm.');
  if (!Number.isFinite(fontSizePt) || fontSizePt < 5 || fontSizePt > 18) throw new Error('Code font size must be between 5 and 18 pt.');
  if (!Number.isFinite(lineHeight) || lineHeight < 1 || lineHeight > 2.5) throw new Error('Line height must be between 1 and 2.5.');
  return {
    paper: layout.paper ?? 'A4',
    marginMm,
    fontSizePt,
    lineHeight,
    lineNumbers: layout.lineNumbers ?? true,
    wrapLongLines: layout.wrapLongLines ?? true
  };
}

function requireValue(value: string, label: string): string {
  if (!value.trim()) throw new Error(`Text bundle requires a non-empty ${label}.`);
  return value.trim();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
