import type { PreviewSourceManifestEntry } from '../../compiler/rehype-plugins';

export interface CommittedPreviewTarget {
  entry: PreviewSourceManifestEntry;
  pageIndex: number;
  element: HTMLElement;
}

/**
 * Maps compiler-side source entries to the immutable page DOM committed by
 * Paged.js. It uses Paged.js's own transient references and never writes
 * application markers into the document HTML.
 */
export class CommittedPreviewIndex {
  private readonly targets: CommittedPreviewTarget[];
  private readonly pageBreakTargets: CommittedPreviewTarget[];

  private constructor(targets: CommittedPreviewTarget[], pageBreakTargets: CommittedPreviewTarget[]) {
    this.targets = targets;
    this.pageBreakTargets = pageBreakTargets;
  }

  public static build(
    container: HTMLElement,
    sourceRoot: HTMLElement,
    manifest: readonly PreviewSourceManifestEntry[]
  ): CommittedPreviewIndex {
    const entriesByReference = new Map<string, PreviewSourceManifestEntry[]>();

    for (const entry of manifest) {
      const sourceElement = resolveElementPath(sourceRoot, entry.elementPath);
      const reference = sourceElement?.getAttribute('data-ref');
      if (!reference) continue;

      const entries = entriesByReference.get(reference) ?? [];
      entries.push(entry);
      entriesByReference.set(reference, entries);
    }

    const targets: CommittedPreviewTarget[] = [];
    const pageBreakTargets: CommittedPreviewTarget[] = [];
    const resolvedReferences = new Set<string>();
    const pages = Array.from(container.querySelectorAll<HTMLElement>('.pagedjs_page'));
    pages.forEach((page, pageIndex) => {
      const candidates = [
        ...Array.from(page.querySelectorAll<HTMLElement>('[data-ref]')),
        ...Array.from(page.querySelectorAll<HTMLElement>('[data-split-from]'))
      ];

      for (const element of candidates) {
        const reference = element.getAttribute('data-ref') ?? element.getAttribute('data-split-from');
        if (!reference || resolvedReferences.has(reference)) continue;

        const entries = entriesByReference.get(reference);
        if (!entries) continue;
        resolvedReferences.add(reference);
        entries.forEach(entry => targets.push({ entry, pageIndex, element }));
      }

      // Every page after the first starts a new printable page. Keep the
      // first source-backed element as a future canonical-view page guide.
      // This does not mutate the rendered document; consumers decide whether
      // and how to display the guide.
      if (pageIndex === 0) return;
      const boundaryElement = candidates.find(element => {
        const reference = element.getAttribute('data-ref') ?? element.getAttribute('data-split-from');
        return Boolean(reference && entriesByReference.has(reference));
      });
      if (!boundaryElement) return;
      const reference = boundaryElement.getAttribute('data-ref') ?? boundaryElement.getAttribute('data-split-from');
      if (!reference) return;
      const entries = entriesByReference.get(reference);
      if (!entries) return;
      entries.forEach(entry => pageBreakTargets.push({ entry, pageIndex, element: boundaryElement }));
    });

    return new CommittedPreviewIndex(targets, pageBreakTargets);
  }

  public get size(): number {
    return this.targets.length;
  }

  public getTargets(): readonly CommittedPreviewTarget[] {
    return this.targets;
  }

  /** First source-backed block on each physical page after page one. */
  public getPageBreakTargets(): readonly CommittedPreviewTarget[] {
    return this.pageBreakTargets;
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

function chooseBestTarget(targets: readonly CommittedPreviewTarget[]): CommittedPreviewTarget {
  return [...targets].sort((left, right) => {
    const leftSpan = left.entry.range.endLine - left.entry.range.startLine;
    const rightSpan = right.entry.range.endLine - right.entry.range.startLine;
    if (leftSpan !== rightSpan) return leftSpan - rightSpan;
    if (left.entry.range.startLine !== right.entry.range.startLine) {
      return right.entry.range.startLine - left.entry.range.startLine;
    }
    return right.entry.priority - left.entry.priority;
  })[0]!;
}

function resolveElementPath(root: HTMLElement, path: readonly number[]): HTMLElement | null {
  let current: HTMLElement = root;
  for (const index of path) {
    const next = current.children.item(index);
    if (!(next instanceof HTMLElement)) return null;
    current = next;
  }
  return current;
}
