import type { PageSetup } from '../state';

export class ScrollSync {
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private appliedScale: number | null = null;
  private currentPageSetup: PageSetup;

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

    let targetEl = this.container.querySelector(`[data-source-line="${line}"]`) as HTMLElement;
    
    let searchLine = line;
    while (!targetEl && searchLine > 0) {
      searchLine--;
      targetEl = this.container.querySelector(`[data-source-line="${searchLine}"]`) as HTMLElement;
    }

    if (!targetEl) return;

    const pageEl = targetEl.closest('.pagedjs_page') as HTMLElement;
    const scrollTarget = pageEl || targetEl;

    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  public scrollToTop() {
    this.container.parentElement?.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}
