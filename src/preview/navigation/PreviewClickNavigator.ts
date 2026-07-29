import type { CommittedPreviewTarget } from './CommittedPreviewIndex';

/** The committed preview data needed to map a rendered element back to source. */
export interface PreviewClickNavigationIndex {
  getTargets(): readonly CommittedPreviewTarget[];
}

/**
 * Owns preview click handling only. It deliberately knows nothing about
 * CodeMirror, document activation, or preview rendering; callers supply the
 * current committed index and decide how a resolved source line is opened.
 */
export class PreviewClickNavigator {
  private index: PreviewClickNavigationIndex | null = null;
  private readonly container: HTMLElement;
  private readonly onNavigateToSourceLine: (line: number, target: CommittedPreviewTarget) => void;

  constructor(
    container: HTMLElement,
    onNavigateToSourceLine: (line: number, target: CommittedPreviewTarget) => void
  ) {
    this.container = container;
    this.onNavigateToSourceLine = onNavigateToSourceLine;
    this.container.addEventListener('click', this.handleClick);
  }

  public setIndex(index: PreviewClickNavigationIndex | null): void {
    this.index = index;
  }

  public destroy(): void {
    this.container.removeEventListener('click', this.handleClick);
    this.index = null;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || !this.index || !(event.target instanceof Element)) return;
    if (shouldIgnorePreviewClick(event.target)) return;

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && this.container.contains(selection.anchorNode)) return;

    const target = resolvePreviewClickTarget(event.target, this.index.getTargets());
    if (target) this.onNavigateToSourceLine(target.entry.range.startLine, target);
  };
}

/** Resolves the most specific source-backed rendered block containing a click. */
export function resolvePreviewClickTarget(
  clickedElement: Element,
  targets: readonly CommittedPreviewTarget[]
): CommittedPreviewTarget | null {
  const matches = targets.filter(target => target.element === clickedElement || target.element.contains(clickedElement));
  if (matches.length > 0) return chooseClosestTarget(clickedElement, matches);

  // Paged.js can preserve a source anchor while replacing the physical node
  // stored in the committed index, most commonly near the start of a page.
  // Resolve through that stable compiler anchor before declaring the click
  // unmapped. The clicked node is retained so consumers always receive the
  // visible element rather than a structural clone.
  const sourceElement = typeof clickedElement.closest === 'function'
    ? clickedElement.closest('[data-ref], [data-split-from]') as HTMLElement | null
    : null;
  if (!sourceElement) return null;
  const reference = sourceElement?.getAttribute('data-ref') ?? sourceElement?.getAttribute('data-split-from');
  if (!reference) return null;
  const anchoredTargets = targets.filter(target => target.entry.anchor === reference);
  if (anchoredTargets.length === 0) return null;
  return { ...chooseClosestTarget(sourceElement, anchoredTargets), element: sourceElement };
}

function chooseClosestTarget(clickedElement: Element, matches: readonly CommittedPreviewTarget[]): CommittedPreviewTarget {
  return [...matches].sort((left, right) => {
    const leftDistance = elementDistance(clickedElement, left.element);
    const rightDistance = elementDistance(clickedElement, right.element);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    const leftSpan = left.entry.range.endLine - left.entry.range.startLine;
    const rightSpan = right.entry.range.endLine - right.entry.range.startLine;
    if (leftSpan !== rightSpan) return leftSpan - rightSpan;
    return right.entry.priority - left.entry.priority;
  })[0]!;
}

function shouldIgnorePreviewClick(element: Element): boolean {
  return Boolean(element.closest('a, button, input, select, textarea, [data-preview-click-navigation-ignore]'));
}

function elementDistance(descendant: Element, ancestor: Element): number {
  let distance = 0;
  let current: Element | null = descendant;
  while (current && current !== ancestor) {
    current = current.parentElement;
    distance += 1;
  }
  return current === ancestor ? distance : Number.MAX_SAFE_INTEGER;
}
