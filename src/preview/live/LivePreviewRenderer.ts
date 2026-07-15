import type { PreviewSourceManifestEntry } from '../../compiler/rehype-plugins';
import type { PageSetup } from '../../state';
import { bindImageFallbacks } from '../../images/imageSources';
import { applyHeadingNumbering } from '../headingNumbering';
import { applySpecialHeadings } from '../specialHeadings';
import { applyTableOfContents } from '../tableOfContents';
import { createLivePreviewDocument, type LivePreviewBlock, type LivePreviewDocument } from './LivePreviewDocument';

export interface CanonicalPageBreakGuide {
  readonly pageNumber: number;
  readonly anchor: string;
  readonly sourceLine?: number;
}

/**
 * Reconciles semantic document blocks without replacing the preview stage.
 * It is deliberately independent from Paged.js: pagination is a print-layout
 * concern and cannot provide stable DOM identity while text is being edited.
 */
export class LivePreviewRenderer {
  private current: LivePreviewDocument | null = null;
  private readonly container: HTMLElement;
  private readonly metadata = new WeakMap<HTMLElement, BlockMetadata>();
  private pageBreakGuides: readonly CanonicalPageBreakGuide[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async render(
    html: string,
    manifest: readonly PreviewSourceManifestEntry[],
    pageSetup: PageSetup,
    isCurrent: () => boolean = () => true
  ): Promise<LivePreviewDocument | null> {
    const source = document.createElement('div');
    source.innerHTML = html;
    bindImageFallbacks(source);
    applyHeadingNumbering(source);
    applySpecialHeadings(source);
    applyTableOfContents(source, pageSetup.toc?.maxLevel);
    await reserveImageLayout(source);
    if (!isCurrent()) return null;
    const next = createLivePreviewDocument(source.innerHTML, manifest);
    const anchor = this.captureAnchor();
    const existing = new Map<string, HTMLElement>();
    const unchangedByContent = new Map<string, HTMLElement[]>();
    for (const node of Array.from(this.container.children)) {
      if (node instanceof HTMLElement && node.dataset.previewBlockId) {
        existing.set(node.dataset.previewBlockId, node);
        const signature = this.metadata.get(node)?.signature;
        if (signature) {
          const candidates = unchangedByContent.get(signature) ?? [];
          candidates.push(node);
          unchangedByContent.set(signature, candidates);
        }
      }
    }

    let cursor: ChildNode | null = this.container.firstChild;
    for (const block of next.blocks) {
      const retained = existing.get(block.id);
      const signature = createBlockSignature(block);
      const contentMatch = unchangedByContent.get(signature)?.shift();
      const node = retained && this.metadata.get(retained)?.html === block.html
        ? retained
        : contentMatch ?? this.createBlockNode(block);
      // An unchanged block can retain its DOM node even if a newly inserted
      // block above it changed its source-line-based provisional id.
      node.dataset.previewBlockId = block.id;
      this.metadata.set(node, { html: block.html, signature });
      if (node !== cursor) this.container.insertBefore(node, cursor);
      cursor = node.nextSibling;
    }
    while (cursor) {
      const obsolete = cursor;
      cursor = cursor.nextSibling;
      obsolete.remove();
    }
    this.current = next;
    this.applyPageBreakGuides();
    this.restoreAnchor(anchor);
    return next;
  }

  public clear(): void {
    this.current = null;
    this.container.replaceChildren();
  }

  public get document(): LivePreviewDocument | null {
    return this.current;
  }

  /**
   * Applies externally computed physical-page boundaries to the continuous
   * canonical view. These guides are UI-only and are rebuilt after every live
   * reconciliation, never becoming part of the document source.
   */
  public setPageBreakGuides(guides: readonly CanonicalPageBreakGuide[]): void {
    this.pageBreakGuides = guides;
    this.applyPageBreakGuides();
  }

  private createBlockNode(block: LivePreviewBlock): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'live-preview-block';
    wrapper.dataset.previewBlockId = block.id;
    Object.entries(block.sectionAttributes).forEach(([name, value]) => {
      wrapper.setAttribute(name, value);
    });
    wrapper.classList.add('document-section');
    wrapper.innerHTML = block.html;
    this.metadata.set(wrapper, { html: block.html, signature: createBlockSignature(block) });
    return wrapper;
  }

  private applyPageBreakGuides(): void {
    const blocks = new Map<HTMLElement, CanonicalPageBreakGuide[]>();
    let mappedGuideCount = 0;
    this.pageBreakGuides.forEach(guide => {
      const source = Array.from(this.container.querySelectorAll<HTMLElement>('[data-ref]'))
        .find(element => element.getAttribute('data-ref') === guide.anchor);
      let block = source?.closest<HTMLElement>('.live-preview-block');
      if (!block && guide.sourceLine && this.current) {
        const matching = this.current.blocks.find(candidate => candidate.manifest.some(entry =>
          entry.range.startLine <= guide.sourceLine!
          && entry.range.endLine >= guide.sourceLine!
        ));
        const nearest = matching ?? this.current.blocks
          .flatMap(candidate => candidate.manifest.map(entry => ({ candidate, entry })))
          .filter(item => item.entry.range.startLine >= guide.sourceLine!)
          .sort((left, right) => left.entry.range.startLine - right.entry.range.startLine)[0]?.candidate
          ?? [...this.current.blocks].reverse().find(candidate => candidate.manifest.some(entry =>
            entry.range.startLine <= guide.sourceLine!
          ));
        if (nearest) {
          block = Array.from(this.container.children).find(node =>
            node instanceof HTMLElement && node.dataset.previewBlockId === nearest.id
          ) as HTMLElement | undefined;
        }
      }
      if (!block) return;
      const guidesForBlock = blocks.get(block) ?? [];
      guidesForBlock.push(guide);
      blocks.set(block, guidesForBlock);
      mappedGuideCount += 1;
    });

    // An empty list is an explicit clear. A non-empty result that cannot map
    // to the current canonical DOM is stale or from another render; preserve
    // the last valid guide set instead of making it disappear.
    if (this.pageBreakGuides.length > 0 && mappedGuideCount < this.pageBreakGuides.length) return;
    this.container.querySelectorAll('.canonical-page-break-guide').forEach(guide => guide.remove());
    this.container.querySelectorAll('.canonical-page-break-before').forEach(block => {
      block.classList.remove('canonical-page-break-before');
    });
    if (this.pageBreakGuides.length === 0) return;

    // Build each block's replacement fragment before touching the visible DOM,
    // so a completed background result appears as one synchronous update.
    blocks.forEach((guides, block) => {
      block.classList.add('canonical-page-break-before');
      const fragment = document.createDocumentFragment();
      guides.sort((left, right) => left.pageNumber - right.pageNumber).forEach(guide => {
        const marker = document.createElement('div');
        marker.className = 'canonical-page-break-guide';
        marker.dataset.pageNumber = String(guide.pageNumber);
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = `Page ${guide.pageNumber}`;
        fragment.appendChild(marker);
      });
      block.before(fragment);
    });
  }

  private captureAnchor(): ScrollAnchor | null {
    const scrollParent = this.container.parentElement;
    if (!scrollParent) return null;
    const parentTop = scrollParent.getBoundingClientRect().top;
    const node = Array.from(this.container.children).find(child => {
      if (!(child instanceof HTMLElement)) return false;
      const rect = child.getBoundingClientRect();
      return rect.bottom > parentTop;
    });
    if (!(node instanceof HTMLElement) || !node.dataset.previewBlockId) return null;
    return {
      id: node.dataset.previewBlockId,
      offset: node.getBoundingClientRect().top - parentTop,
      scrollTop: scrollParent.scrollTop
    };
  }

  private restoreAnchor(anchor: ScrollAnchor | null): void {
    const scrollParent = this.container.parentElement;
    if (!anchor || !scrollParent) return;
    const restore = () => {
      // Do not override a scroll the reader made while an asynchronous image
      // was being decoded or while the browser was preparing the mutation.
      if (Math.abs(scrollParent.scrollTop - anchor.scrollTop) > 1) return;
      const node = Array.from(this.container.children).find(child =>
        child instanceof HTMLElement && child.dataset.previewBlockId === anchor.id
      );
      if (!(node instanceof HTMLElement)) return;
      const currentOffset = node.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top;
      scrollParent.scrollTop += currentOffset - anchor.offset;
    };
    restore();
    window.requestAnimationFrame(restore);
  }
}

function createBlockSignature(block: LivePreviewBlock): string {
  return `${block.tagName}\u0000${block.html}`;
}

interface ScrollAnchor {
  id: string;
  offset: number;
  scrollTop: number;
}

interface BlockMetadata {
  html: string;
  signature: string;
}

/**
 * Give images intrinsic dimensions before their block enters the live stage.
 * The browser can therefore lay out the block once rather than shifting the
 * entire document when an image finishes decoding.
 */
async function reserveImageLayout(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(images.map(async image => {
    if (!image.complete) {
      await new Promise<void>(resolve => {
        const timeout = window.setTimeout(resolve, 2500);
        image.addEventListener('load', () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
        image.addEventListener('error', () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      image.width = image.naturalWidth;
      image.height = image.naturalHeight;
      image.style.height = 'auto';
    }
  }));
}
