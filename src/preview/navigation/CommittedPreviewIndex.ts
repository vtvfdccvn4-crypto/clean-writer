import type { PreviewSourceManifestEntry } from '../../compiler/rehype-plugins';
import { resolveSourceLineTarget } from './PreviewTargetSelection';

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
    manifest: readonly PreviewSourceManifestEntry[]
  ): CommittedPreviewIndex {
    const entriesByReference = new Map<string, PreviewSourceManifestEntry[]>();

    for (const entry of manifest) {
      const reference = entry.anchor;

      const entries = entriesByReference.get(reference) ?? [];
      entries.push(entry);
      entriesByReference.set(reference, entries);
    }

    const targets: CommittedPreviewTarget[] = [];
    const pageBreakTargets: CommittedPreviewTarget[] = [];
    const pages = Array.from(container.querySelectorAll<HTMLElement>('.pagedjs_page'));
    pages.forEach((page, pageIndex) => {
      const candidates = collectVisiblePageSourceElements(page);

      for (const element of candidates) {
        const reference = element.getAttribute('data-ref') ?? element.getAttribute('data-split-from');
        if (!reference) continue;

        const entries = entriesByReference.get(reference);
        if (!entries) continue;
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
    return resolveSourceLineTarget(this.targets, line);
  }
}

/**
 * Paged.js can retain structural copies of source nodes near the start of a
 * page. Only nodes inside the visible page content may receive click mapping;
 * keeping every visible instance also preserves clicks on blocks split across
 * physical pages.
 */
export function collectVisiblePageSourceElements(page: HTMLElement): HTMLElement[] {
  const elements = [
    ...Array.from(page.querySelectorAll<HTMLElement>('[data-ref]')),
    ...Array.from(page.querySelectorAll<HTMLElement>('[data-split-from]'))
  ];
  return elements.filter(element => isVisiblePageSourceElement(element, page));
}

export function isVisiblePageSourceElement(element: HTMLElement, page: HTMLElement): boolean {
  const pageContent = element.closest('.pagedjs_page_content');
  return pageContent !== null && page.contains(pageContent);
}
