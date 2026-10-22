import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { compilePreviewDocument, type CompiledPreview } from '../../compiler';
import type { AssetResolver } from '../../platform/types';
import type { PreviewSourceManifestEntry } from '../../compiler/rehype-plugins';

interface SourceBlock {
  markdown: string;
  startLine: number;
}

interface CompiledBlock {
  markdown: string;
  startLine: number;
  html: string;
  manifest: readonly PreviewSourceManifestEntry[];
  childCount: number;
}

interface SectionEnvelope {
  openingHtml: string;
  closingHtml: string;
  body: string;
  bodyStartLine: number;
}

const MAX_CONCURRENT_BLOCK_COMPILATIONS = 4;

/**
 * Compiles only Markdown blocks whose source changed. The document wrapper is
 * preserved while unchanged top-level Markdown AST nodes reuse their prior
 * compiled output through linear, content-keyed matching.
 */
export class IncrementalPreviewCompiler {
  private previous: readonly CompiledBlock[] = [];

  public reset(): void {
    this.previous = [];
  }

  public async compile(markdown: string, assetResolver: AssetResolver): Promise<CompiledPreview | null> {
    const envelope = splitSectionEnvelope(markdown);
    if (!envelope) return null;
    const sourceBlocks = parseSourceBlocks(envelope.body, envelope.bodyStartLine);
    if (!sourceBlocks) return null;

    const reusable = matchUnchangedBlocks(this.previous, sourceBlocks);
    const blocks = await mapWithConcurrency(sourceBlocks, MAX_CONCURRENT_BLOCK_COMPILATIONS, async (source, index) => {
      const previous = reusable.get(index);
      if (previous) return { ...previous, startLine: source.startLine };
      return this.compileBlock(envelope, source, assetResolver);
    });
    this.previous = blocks;
    return assemblePreview(envelope, blocks);
  }

  private async compileBlock(
    envelope: SectionEnvelope,
    source: SourceBlock,
    assetResolver: AssetResolver
  ): Promise<CompiledBlock> {
    // The blank lines make the local source range deterministic: Markdown
    // content starts at line 3 inside this temporary document section.
    const local = `${envelope.openingHtml}\n\n${source.markdown}\n\n${envelope.closingHtml}`;
    const compiled = await compilePreviewDocument(local, assetResolver);
    const template = document.createElement('template');
    template.innerHTML = compiled.html;
    const section = template.content.firstElementChild;
    if (!(section instanceof HTMLElement)) throw new Error('Incremental preview block did not compile to a document section.');
    return {
      markdown: source.markdown,
      startLine: source.startLine,
      html: section.innerHTML,
      manifest: compiled.manifest,
      childCount: section.children.length
    };
  }
}

function splitSectionEnvelope(markdown: string): SectionEnvelope | null {
  const openingEnd = markdown.indexOf('>');
  const closingStart = markdown.lastIndexOf('</div>');
  if (openingEnd < 0 || closingStart <= openingEnd) return null;
  const openingHtml = markdown.slice(0, openingEnd + 1);
  if (!/class\s*=\s*["'][^"']*\bdocument-section\b/i.test(openingHtml)) return null;
  const prefix = markdown.slice(0, openingEnd + 1);
  const rawBody = markdown.slice(openingEnd + 1, closingStart);
  const leadingWhitespace = rawBody.match(/^(?:[ \t]*\r?\n)*/)?.[0] ?? '';
  const body = rawBody.slice(leadingWhitespace.length).replace(/\r?\n[ \t\r\n]*$/, '');
  return {
    openingHtml,
    closingHtml: '</div>',
    body,
    // The generated section envelope contributes two lines before the
    // Markdown body.  The manifest consumed by the editor is expressed in
    // editor-source lines, so remove that envelope offset here rather than
    // letting every incremental target drift below the first block.
    bodyStartLine: prefix.split(/\r?\n/).length + leadingWhitespace.split(/\r?\n/).length - 3
  };
}

function parseSourceBlocks(body: string, bodyStartLine: number): SourceBlock[] | null {
  const tree = unified().use(remarkParse).parse(body);
  const blocks: SourceBlock[] = [];
  for (const node of tree.children) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const startLine = node.position?.start.line;
    if (start === undefined || end === undefined || startLine === undefined) return null;
    if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(startLine)) return null;
    blocks.push({
      markdown: body.slice(start, end),
      startLine: bodyStartLine + startLine - 1
    });
  }
  return blocks;
}

export function matchUnchangedBlocks<T extends { markdown: string }>(
  previous: readonly T[],
  next: readonly { markdown: string }[]
): Map<number, T> {
  const reusableByMarkdown = new Map<string, T[]>();
  previous.forEach(block => {
    const candidates = reusableByMarkdown.get(block.markdown);
    if (candidates) candidates.push(block);
    else reusableByMarkdown.set(block.markdown, [block]);
  });

  const nextCandidateIndex = new Map<string, number>();
  const matched = new Map<number, T>();
  next.forEach((block, index) => {
    const markdown = block.markdown;
    const candidates = reusableByMarkdown.get(markdown);
    const candidateIndex = nextCandidateIndex.get(markdown) ?? 0;
    const candidate = candidates?.[candidateIndex];
    if (!candidate) return;
    matched.set(index, candidate);
    nextCandidateIndex.set(markdown, candidateIndex + 1);
  });
  return matched;
}

/** Maps source-order work with a bounded number of active asynchronous jobs. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  maxConcurrency: number,
  map: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await map(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, maxConcurrency), items.length) }, worker));
  return results;
}

function assemblePreview(envelope: SectionEnvelope, blocks: readonly CompiledBlock[]): CompiledPreview {
  const template = document.createElement('template');
  template.innerHTML = `${envelope.openingHtml}${envelope.closingHtml}`;
  const section = template.content.firstElementChild;
  if (!(section instanceof HTMLElement)) throw new Error('Incremental preview could not assemble its document section.');

  let childOffset = 0;
  const manifest: PreviewSourceManifestEntry[] = [];
  blocks.forEach(block => {
    const children = document.createElement('template');
    children.innerHTML = block.html;
    section.appendChild(children.content);
    block.manifest.forEach(entry => {
      const localPath = entry.elementPath.slice(1);
      if (localPath.length === 0) return;
      const elementPath = [0, childOffset + localPath[0]!, ...localPath.slice(1)];
      const anchor = `preview-source-${elementPath.join('-')}`;
      const element = resolveElementPath(section, elementPath.slice(1));
      element?.setAttribute('data-ref', anchor);
      manifest.push({
        ...entry,
        anchor,
        elementPath,
        range: {
          startLine: Math.max(1, block.startLine + entry.range.startLine - 3),
          endLine: Math.max(1, block.startLine + entry.range.endLine - 3)
        }
      });
    });
    childOffset += block.childCount;
  });
  return { html: section.outerHTML, manifest };
}

function resolveElementPath(root: HTMLElement, path: readonly number[]): HTMLElement | null {
  let current = root;
  for (const index of path) {
    const next = current.children.item(index);
    if (!(next instanceof HTMLElement)) return null;
    current = next;
  }
  return current;
}
