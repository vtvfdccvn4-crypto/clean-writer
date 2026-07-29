import { EditorView, ViewPlugin } from '@codemirror/view';
import { buildImageBlockMove, getImageBlockAtPosition, type ImageBlockRange } from '../images/imageBlockMove';

const HOLD_DELAY_MS = 200;
const MOVE_THRESHOLD_PX = 6;

interface PendingImageDrag {
  pointerId: number;
  source: ImageBlockRange;
  sourceElement: HTMLElement;
  startX: number;
  startY: number;
  dropPosition: number | null;
  nativeDragging: boolean;
}

function isInteractiveWidgetControl(target: Element): boolean {
  return Boolean(target.closest('button, input, label'));
}

/**
 * Uses CodeMirror's native drop cursor only as a visual guide. The document
 * edit is a direct, undoable cut-and-paste transaction, so it does not depend
 * on browser clipboard permissions or on a native text drop being accepted.
 */
export function imageBlockPointerDragExtension() {
  return ViewPlugin.fromClass(class {
    private holdTimer: number | null = null;
    private pending: PendingImageDrag | null = null;
    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
    }

    private clearGesture(): void {
      if (this.holdTimer !== null) window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
      if (this.pending) {
        this.pending.sourceElement.draggable = false;
        this.pending.sourceElement.removeAttribute('data-image-dragging');
      }
      this.pending = null;
    }

    private sourceAt(target: EventTarget | null): { element: HTMLElement; source: ImageBlockRange } | null {
      if (!(target instanceof Element) || isInteractiveWidgetControl(target)) return null;
      const element = target.closest<HTMLElement>('[data-image-preview-drag-source="true"]');
      if (!element || !this.view.dom.contains(element)) return null;
      try {
        const position = this.view.posAtDOM(element, 0);
        const source = getImageBlockAtPosition(this.view.state.doc.toString(), position);
        return source ? { element, source } : null;
      } catch {
        return null;
      }
    }

    pointerdown(event: PointerEvent): boolean {
      if (event.button !== 0 || this.pending) return false;
      const found = this.sourceAt(event.target);
      if (!found) return false;

      this.pending = {
        pointerId: event.pointerId,
        source: found.source,
        sourceElement: found.element,
        startX: event.clientX,
        startY: event.clientY,
        dropPosition: null,
        nativeDragging: false
      };
      this.holdTimer = window.setTimeout(() => {
        this.holdTimer = null;
        if (this.pending?.pointerId === event.pointerId) this.pending.sourceElement.draggable = true;
      }, HOLD_DELAY_MS);
      return false;
    }

    pointermove(event: PointerEvent): boolean {
      const pending = this.pending;
      if (!pending || pending.pointerId !== event.pointerId) return false;
      if (this.holdTimer === null) return false;

      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) >= MOVE_THRESHOLD_PX) {
        // A normal selection gesture should win if the user moves before the
        // hold delay; only a deliberate hold enables the native drag.
        this.clearGesture();
      }
      return false;
    }

    pointerup(event: PointerEvent): boolean {
      if (this.pending?.pointerId !== event.pointerId) return false;
      if (this.pending.nativeDragging) return false;
      this.clearGesture();
      return false;
    }

    pointercancel(event: PointerEvent): boolean {
      if (this.pending?.pointerId !== event.pointerId) return false;
      // Browsers cancel the original pointer stream when native dragging
      // begins. The drag events now own completion of this gesture.
      if (this.pending.nativeDragging) return false;
      this.clearGesture();
      return false;
    }

    dragstart(event: DragEvent): boolean {
      const pending = this.pending;
      if (!pending || event.target !== pending.sourceElement && !(event.target instanceof Node && pending.sourceElement.contains(event.target))) return false;
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
      pending.sourceElement.setAttribute('data-image-dragging', 'true');
      pending.nativeDragging = true;
      return false;
    }

    dragover(event: DragEvent): boolean {
      const pending = this.pending;
      if (!pending?.nativeDragging) return false;
      const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
      if (position !== null) pending.dropPosition = position;
      // This authorizes a browser drop without intercepting CodeMirror's
      // drop-cursor observer, which has already rendered the guide.
      event.preventDefault();
      return false;
    }

    private finishImageBlockDrag(event: DragEvent): void {
      const pending = this.pending;
      if (!pending?.nativeDragging || pending.dropPosition === null) {
        this.clearGesture();
        return;
      }
      const move = buildImageBlockMove(
        this.view.state.doc.toString(),
        pending.source,
        pending.dropPosition,
        event.ctrlKey || event.altKey
      );
      if (!move) {
        this.clearGesture();
        return;
      }

      if (move.changes.length === 1) {
        this.view.dispatch({
          changes: move.changes[0],
          selection: { anchor: move.selectionAnchor },
          scrollIntoView: true,
          userEvent: 'move.image'
        });
      } else {
        this.view.dispatch(
          { changes: move.changes[0] },
          {
            changes: move.changes[1],
            selection: { anchor: move.selectionAnchor },
            scrollIntoView: true,
            sequential: true,
            userEvent: 'move.image'
          }
        );
      }
      this.view.focus();
      this.clearGesture();
    }

    drop(event: DragEvent): boolean {
      if (!this.pending?.nativeDragging) return false;
      this.finishImageBlockDrag(event);
      // Prevent CodeMirror's default text drop from applying a second move.
      return true;
    }

    dragend(event: DragEvent): boolean {
      this.finishImageBlockDrag(event);
      return false;
    }

    keydown(event: KeyboardEvent): boolean {
      if (event.key !== 'Escape' || !this.pending) return false;
      this.clearGesture();
      return false;
    }

    destroy(): void {
      this.clearGesture();
    }
  }, {
    eventHandlers: {
      pointerdown(event) { return this.pointerdown(event); },
      pointermove(event) { return this.pointermove(event); },
      pointerup(event) { return this.pointerup(event); },
      pointercancel(event) { return this.pointercancel(event); },
      dragstart(event) { return this.dragstart(event); },
      dragover(event) { return this.dragover(event); },
      drop(event) { return this.drop(event); },
      dragend(event) { return this.dragend(event); },
      keydown(event) { return this.keydown(event); }
    }
  });
}
