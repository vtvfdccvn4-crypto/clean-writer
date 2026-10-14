import type { SplitPaneConstraints, SplitPaneControllerOptions } from './contracts';
import { calculateSplitPaneConstraints, clampSplitPaneRatio, leadingWidthForRatio } from './SplitPaneGeometry';
import { persistSplitPaneRatio, readSplitPaneRatio } from './SplitPanePersistence';

const KEYBOARD_STEP = 10;
const KEYBOARD_LARGE_STEP = 50;

/**
 * Resizes two horizontal panes. Geometry is captured at drag start so pointer
 * movement never forces synchronous layout reads.
 */
export class SplitPaneController {
  private readonly options: SplitPaneControllerOptions;
  private currentRatio: number;
  private activePointerId: number | null = null;
  private dragConstraints: SplitPaneConstraints | null = null;
  private pendingRatio: number | null = null;
  private resizeFrame: number | null = null;
  private externalResizeFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastLeadingWidth: number | null = null;
  private compact: boolean | null = null;

  public constructor(options: SplitPaneControllerOptions) {
    this.options = options;
    this.currentRatio = readSplitPaneRatio(options.storageKey) ?? options.defaultRatio;
  }

  public initialize(): void {
    this.options.separator.addEventListener('pointerdown', this.onPointerDown);
    this.options.separator.addEventListener('keydown', this.onKeyDown);
    this.options.separator.addEventListener('dblclick', this.onDoubleClick);
    this.resizeObserver = new ResizeObserver(this.scheduleExternalResize);
    this.resizeObserver.observe(this.options.container);
    this.applyForCurrentContainer(true);
  }

  public dispose(): void {
    this.stopDragging();
    if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
    if (this.externalResizeFrame !== null) window.cancelAnimationFrame(this.externalResizeFrame);
    this.options.separator.removeEventListener('pointerdown', this.onPointerDown);
    this.options.separator.removeEventListener('keydown', this.onKeyDown);
    this.options.separator.removeEventListener('dblclick', this.onDoubleClick);
    this.resizeObserver?.disconnect();
  }

  private measureConstraints(): SplitPaneConstraints {
    const bounds = this.options.container.getBoundingClientRect();
    return calculateSplitPaneConstraints(
      bounds.left,
      bounds.width,
      this.options.separatorWidth,
      this.options.minimumLeadingWidth,
      this.options.minimumTrailingWidth
    );
  }

  private applyForCurrentContainer(updateAria: boolean): void {
    const constraints = this.measureConstraints();
    this.applyRatio(this.currentRatio, constraints, updateAria);
  }

  private applyRatio(requestedRatio: number, constraints: SplitPaneConstraints, updateAria: boolean): void {
    const ratio = clampSplitPaneRatio(requestedRatio, constraints, this.options.defaultRatio);
    if (!constraints.compact) this.currentRatio = ratio;
    this.applyCompactState(constraints.compact);
    if (constraints.usableWidth <= 0) return;

    const leadingWidth = leadingWidthForRatio(ratio, constraints);
    if (this.lastLeadingWidth !== leadingWidth) {
      this.lastLeadingWidth = leadingWidth;
      this.options.container.style.setProperty(this.options.cssProperty, `${leadingWidth}px`);
    }
    if (updateAria) this.applyAria(leadingWidth, ratio, constraints);
  }

  private applyCompactState(compact: boolean): void {
    if (this.compact === compact) return;
    this.compact = compact;
    this.options.container.classList.toggle('is-editor-preview-compact', compact);
    this.options.separator.setAttribute('aria-disabled', String(compact));
    this.options.separator.tabIndex = compact ? -1 : 0;
  }

  private applyAria(leadingWidth: number, ratio: number, constraints: SplitPaneConstraints): void {
    this.options.separator.setAttribute('aria-valuemin', String(Math.round(constraints.minimumLeadingWidth)));
    this.options.separator.setAttribute('aria-valuemax', String(Math.floor(constraints.maximumLeadingWidth)));
    this.options.separator.setAttribute('aria-valuenow', String(leadingWidth));
    this.options.separator.setAttribute('aria-valuetext', `Editor ${Math.round(ratio * 100)}%, preview ${Math.round((1 - ratio) * 100)}%`);
  }

  private scheduleExternalResize = (): void => {
    if (this.activePointerId !== null || this.externalResizeFrame !== null) return;
    this.externalResizeFrame = window.requestAnimationFrame(() => {
      this.externalResizeFrame = null;
      this.applyForCurrentContainer(true);
    });
  };

  private scheduleRatio(ratio: number): void {
    this.pendingRatio = ratio;
    if (this.resizeFrame !== null) return;
    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.flushPendingRatio(false);
    });
  }

  private flushPendingRatio(updateAria: boolean): void {
    if (this.resizeFrame !== null) {
      window.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
    if (this.pendingRatio === null || !this.dragConstraints) return;
    const ratio = this.pendingRatio;
    this.pendingRatio = null;
    this.applyRatio(ratio, this.dragConstraints, updateAria);
  }

  private stopDragging = (): void => {
    if (this.activePointerId === null) return;
    this.flushPendingRatio(true);
    if (this.options.separator.hasPointerCapture?.(this.activePointerId)) {
      this.options.separator.releasePointerCapture(this.activePointerId);
    }
    this.activePointerId = null;
    this.dragConstraints = null;
    this.options.container.removeAttribute('data-editor-preview-dragging');
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.stopDragging);
    window.removeEventListener('pointercancel', this.stopDragging);
    persistSplitPaneRatio(this.options.storageKey, this.currentRatio);
    this.options.onDragEnd?.();
  };

  private onPointerMove = (event: PointerEvent): void => {
    const constraints = this.dragConstraints;
    if (this.activePointerId !== event.pointerId || !constraints || constraints.compact || constraints.usableWidth <= 0) return;
    this.scheduleRatio((event.clientX - constraints.containerLeft) / constraints.usableWidth);
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const constraints = this.measureConstraints();
    if (constraints.compact) return;
    this.activePointerId = event.pointerId;
    this.dragConstraints = constraints;
    try {
      this.options.separator.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events used by browser tests do not create an active pointer.
    }
    this.options.container.setAttribute('data-editor-preview-dragging', 'true');
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.stopDragging);
    window.addEventListener('pointercancel', this.stopDragging);
    this.options.onDragStart?.();
    event.preventDefault();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const constraints = this.measureConstraints();
    if (constraints.compact || constraints.usableWidth <= 0) return;
    const currentWidth = this.currentRatio * constraints.usableWidth;
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    let nextWidth: number | null = null;
    if (event.key === 'ArrowLeft') nextWidth = currentWidth - step;
    if (event.key === 'ArrowRight') nextWidth = currentWidth + step;
    if (event.key === 'Home') nextWidth = constraints.minimumLeadingWidth;
    if (event.key === 'End') nextWidth = constraints.maximumLeadingWidth;
    if (event.key === 'Enter') nextWidth = constraints.usableWidth * this.options.defaultRatio;
    if (nextWidth === null) return;
    event.preventDefault();
    this.applyRatio(nextWidth / constraints.usableWidth, constraints, true);
    persistSplitPaneRatio(this.options.storageKey, this.currentRatio);
  };

  private onDoubleClick = (): void => {
    const constraints = this.measureConstraints();
    if (constraints.compact) return;
    this.applyRatio(this.options.defaultRatio, constraints, true);
    persistSplitPaneRatio(this.options.storageKey, this.currentRatio);
  };
}
