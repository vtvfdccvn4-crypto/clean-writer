import type { EditorView } from '@codemirror/view';
import type { CommittedPreviewTarget } from './CommittedPreviewIndex';
import {
  calculateLinkedScrollTop,
  type LinkedScrollAnchor,
  type LinkedScrollPane,
  resolvePreviewTargetForLine
} from './LinkedScrollController';

export function createCodeMirrorLinkedScrollPane(view: EditorView): LinkedScrollPane {
  return {
    scrollElement: view.scrollDOM,
    anchorAtViewportFraction: viewportFraction => {
      const height = view.scrollDOM.scrollTop + (view.scrollDOM.clientHeight * viewportFraction);
      const block = view.lineBlockAtHeight(height);
      return { line: view.state.doc.lineAt(block.from).number };
    },
    scrollAnchorToViewportFraction: (anchor, viewportFraction) => {
      const line = view.state.doc.line(Math.min(Math.max(1, anchor.line), view.state.doc.lines));
      const block = view.lineBlockAt(line.from);
      view.scrollDOM.scrollTo({
        top: calculateLinkedScrollTop(block.top, view.scrollDOM.clientHeight, view.scrollDOM.scrollHeight, viewportFraction),
        behavior: 'auto'
      });
    }
  };
}

export interface PreviewLinkedScrollPaneOptions {
  scrollElement: HTMLElement;
  getTargets: () => readonly CommittedPreviewTarget[];
}

export function createPreviewLinkedScrollPane(options: PreviewLinkedScrollPaneOptions): LinkedScrollPane {
  const { scrollElement, getTargets } = options;
  let lastAnchor: LinkedScrollAnchor | null = null;
  return {
    scrollElement,
    anchorAtViewportFraction: viewportFraction => {
      const desiredTop = scrollElement.scrollTop + (scrollElement.clientHeight * viewportFraction);
      const target = nearestTargetAtLayoutPosition(getTargets(), scrollElement, desiredTop);
      if (!target) return lastAnchor;
      lastAnchor = { line: target.entry.range.startLine };
      return lastAnchor;
    },
    scrollAnchorToViewportFraction: (anchor: LinkedScrollAnchor, viewportFraction) => {
      const target = resolvePreviewTargetForLine(getTargets(), anchor.line);
      if (!target) return;
      const targetTop = layoutTopWithinScrollElement(target.element, scrollElement);
      if (targetTop === null) return;
      scrollElement.scrollTo({
        top: calculateLinkedScrollTop(targetTop, scrollElement.clientHeight, scrollElement.scrollHeight, viewportFraction),
        behavior: 'auto'
      });
    }
  };
}

function nearestTargetAtLayoutPosition(
  targets: readonly CommittedPreviewTarget[],
  scrollElement: HTMLElement,
  desiredTop: number
): CommittedPreviewTarget | null {
  let nearest: CommittedPreviewTarget | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (!target.element.isConnected) continue;
    const top = layoutTopWithinScrollElement(target.element, scrollElement);
    if (top === null) continue;
    const distance = Math.abs((top + (target.element.offsetHeight / 2)) - desiredTop);
    if (distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * Returns an element position in the scroll container's layout coordinate
 * system. Unlike getBoundingClientRect(), offset coordinates are unaffected
 * by the preview's transform/zoom and can safely be combined with scrollTop.
 */
function layoutTopWithinScrollElement(element: HTMLElement, scrollElement: HTMLElement): number | null {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current && current !== scrollElement) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return current === scrollElement ? top : null;
}
