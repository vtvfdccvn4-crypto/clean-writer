import type { CommittedPreviewTarget } from '../navigation/CommittedPreviewIndex';
import type { LivePreviewDocument } from './LivePreviewDocument';

/** Source navigation index for the continuous, block-based live preview. */
export class LivePreviewIndex {
  private readonly targets: readonly CommittedPreviewTarget[];

  private constructor(targets: readonly CommittedPreviewTarget[]) {
    this.targets = targets;
  }

  public static build(container: HTMLElement, document: LivePreviewDocument): LivePreviewIndex {
    const nodes = new Map<string, HTMLElement>();
    Array.from(container.children).forEach(node => {
      if (node instanceof HTMLElement && node.dataset.previewBlockId) {
        nodes.set(node.dataset.previewBlockId, node);
      }
    });
    const targets: CommittedPreviewTarget[] = [];
    document.blocks.forEach(block => {
      const node = nodes.get(block.id);
      if (!node) return;
      block.manifest.forEach(entry => targets.push({
        entry,
        pageIndex: 0,
        element: resolveBlockElement(node, entry.elementPath, block.sourcePathDepth) ?? node
      }));
    });
    return new LivePreviewIndex(targets);
  }

  public resolve(line: number): CommittedPreviewTarget | null {
    const containing = this.targets.filter(target =>
      target.entry.range.startLine <= line && target.entry.range.endLine >= line
    );
    if (containing.length > 0) return chooseBestTarget(containing);
    const preceding = this.targets.filter(target => target.entry.range.startLine <= line);
    return preceding.length > 0 ? chooseBestTarget(preceding) : null;
  }
}

function resolveBlockElement(
  blockNode: HTMLElement,
  elementPath: readonly number[],
  sourcePathDepth: number
): HTMLElement | null {
  const root = blockNode.firstElementChild;
  if (!(root instanceof HTMLElement)) return null;
  let current: HTMLElement = root;
  for (const index of elementPath.slice(sourcePathDepth)) {
    const next: Element | null = current.children.item(index);
    if (!(next instanceof HTMLElement)) return null;
    current = next;
  }
  return current;
}

function chooseBestTarget(targets: readonly CommittedPreviewTarget[]): CommittedPreviewTarget {
  return [...targets].sort((left, right) => {
    const leftSpan = left.entry.range.endLine - left.entry.range.startLine;
    const rightSpan = right.entry.range.endLine - right.entry.range.startLine;
    return leftSpan === rightSpan
      ? right.entry.priority - left.entry.priority
      : leftSpan - rightSpan;
  })[0]!;
}
