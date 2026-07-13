import type { PageSetup } from '../state';

/** Owns viewport-only concerns; it deliberately has no source-document mapping. */
export class PreviewViewport {
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private appliedScale: number | null = null;
  private readonly container: HTMLElement;
  private currentPageSetup: PageSetup;

  constructor(container: HTMLElement, initialPageSetup: PageSetup) {
    this.container = container;
    this.currentPageSetup = initialPageSetup;
  }

  public setPageSetup(setup: PageSetup) {
    this.currentPageSetup = setup;
    this.updateZoomScale();
  }

  public updateZoomScale() {
    const scrollParent = this.container.parentElement;
    if (!scrollParent) return;

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

  public scrollToTop() {
    // Document activation is a viewport reset, not user navigation. Smooth
    // scrolling leaves the previous document visibly moving during a render.
    this.container.parentElement?.scrollTo({ top: 0, behavior: 'auto' });
  }

  public scrollElementToTop(target: HTMLElement) {
    const scrollParent = this.container.parentElement;
    if (!scrollParent) return;

    const targetRect = target.getBoundingClientRect();
    const parentRect = scrollParent.getBoundingClientRect();
    const topInset = 12;
    const desiredTop = scrollParent.scrollTop
      + targetRect.top
      - parentRect.top
      - topInset;
    const maxTop = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scrollParent.scrollTo({
      top: Math.min(maxTop, Math.max(0, desiredTop)),
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  }
}
