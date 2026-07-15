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

/**
 * Compiles only Markdown blocks whose source changed. The document wrapper is
 * preserved while individual top-level Markdown AST nodes are reconciled with
 * an LCS match against the previous revision.
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
    const blocks = await Promise.all(sourceBlocks.map(async (source, index) => {
      const previous = reusable.get(index);
      if (previous) return { ...previous, startLine: source.startLine };
      return this.compileBlock(envelope, source, assetResolver);
    }));
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
    bodyStartLine: prefix.split(/\r?\n/).length + leadingWhitespace.split(/\r?\n/).length - 1
  };
}

function parseSourceBlocks(body: string, bodyStartLine: number): SourceBlock[] | null {
  const tree: any = unified().use(remarkParse).parse(body);
  if (!Array.isArray(tree.children)) return null;
  const blocks: SourceBlock[] = [];
  for (const node of tree.children) {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    const startLine = node.position?.start?.line;
    if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(startLine)) return null;
    blocks.push({
      markdown: body.slice(start, end),
      startLine: bodyStartLine + startLine - 1
    });
  }
  return blocks;
}

function matchUnchangedBlocks(previous: readonly CompiledBlock[], next: readonly SourceBlock[]): Map<number, CompiledBlock> {
  const table = Array.from({ length: previous.length + 1 }, () => new Uint32Array(next.length + 1));
  for (let oldIndex = previous.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = next.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex]![newIndex] = previous[oldIndex]!.markdown === next[newIndex]!.markdown
        ? table[oldIndex + 1]![newIndex + 1]! + 1
        : Math.max(table[oldIndex + 1]![newIndex]!, table[oldIndex]![newIndex + 1]!);
    }
  }
  const matched = new Map<number, CompiledBlock>();
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < previous.length && newIndex < next.length) {
    if (previous[oldIndex]!.markdown === next[newIndex]!.markdown) {
      matched.set(newIndex, previous[oldIndex]!);
      oldIndex += 1;
      newIndex += 1;
    } else if (table[oldIndex + 1]![newIndex]! >= table[oldIndex]![newIndex + 1]!) {
      oldIndex += 1;
    } else {
      newIndex += 1;
    }
  }
  return matched;
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
