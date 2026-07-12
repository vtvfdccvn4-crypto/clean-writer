import type { PageSetup } from '../state';
import { SourceAnchorIndex } from './SourceAnchorIndex';

export class ScrollSync {
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private appliedScale: number | null = null;
  private currentPageSetup: PageSetup;
  private sourceAnchors = new SourceAnchorIndex();

  constructor(container: HTMLElement, initialSetup: PageSetup) {
    this.container = container;
    this.currentPageSetup = initialSetup;
  }

  public setPageSetup(setup: PageSetup) {
    this.currentPageSetup = setup;
    this.updateZoomScale();
  }

  public updateZoomScale() {
    const scrollParent = this.container.parentElement;
    if (!scrollParent) return;
    
    // Use the parent's border-box width so scrollbar appearance cannot feed
    // back into the scale calculation and make the preview oscillate.
    const containerWidth = scrollParent.getBoundingClientRect().width;
    const paperWidthPx = this.currentPageSetup.paperWidth * 3.779527559;
    const edgeInset = 12;
    const availablePaperWidth = Math.max(0, containerWidth - (edgeInset * 2));

    const scale = Math.min(1, Math.max(0, availablePaperWidth / paperWidthPx));
    if (this.appliedScale !== null && Math.abs(scale - this.appliedScale) < 0.001) return;

    this.appliedScale = scale;
    this.container.style.setProperty('--preview-scale', scale.toString());
  }

  public setupResponsiveZoom() {
    const scrollParent = this.container.parentElement;
    if (!scrollParent) return;

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = null;
        this.updateZoomScale();
      });
    });

    this.resizeObserver.observe(scrollParent);
  }

  public scrollToLine(line: number, isTextMutation: boolean) {
    if (isTextMutation) return;

    // Rebuild at navigation time as well as after exact commits. Fast-lane
    // morphs can change source blocks before pagination catches up.
    this.sourceAnchors.rebuild(this.container);
    const targetEl = this.sourceAnchors.resolve(line)?.elements[0];
    if (!targetEl) return;

    const pageEl = targetEl.closest('.pagedjs_page') as HTMLElement;
    this.centerInPreview(targetEl, pageEl);
  }

  public refreshSourceAnchors() {
    this.sourceAnchors.rebuild(this.container);
  }

  public scrollToTop() {
    this.container.parentElement?.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  public clearSourceAnchors() {
    this.sourceAnchors.clear();
  }

  private centerInPreview(targetEl: HTMLElement, pageFallback: HTMLElement | null) {
    const scrollParent = this.container.parentElement;
    if (!scrollParent) return;

    // getBoundingClientRect includes the preview's CSS transform. Converting
    // that visual delta into the scroll parent's coordinate space avoids the
    // growing offset produced by native scrollIntoView on scaled previews.
    const targetRect = targetEl.getBoundingClientRect();
    const parentRect = scrollParent.getBoundingClientRect();
    const element = targetRect.height > 0 ? targetEl : pageFallback;
    if (!element) return;

    const rect = element === targetEl ? targetRect : element.getBoundingClientRect();
    const desiredTop = scrollParent.scrollTop
      + rect.top
      - parentRect.top
      - ((scrollParent.clientHeight - Math.min(rect.height, scrollParent.clientHeight)) / 2);
    const maxTop = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);
    scrollParent.scrollTo({
      top: Math.min(maxTop, Math.max(0, desiredTop)),
      behavior: 'smooth'
    });
  }
}
