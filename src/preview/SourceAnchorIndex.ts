import { resolveSourceAnchor, type SourceAnchor } from './SourceAnchorResolver';

export interface ResolvedPreviewAnchor {
  id: string;
  startLine: number;
  endLine: number;
  elements: readonly HTMLElement[];
}

type IndexedAnchor = SourceAnchor<readonly HTMLElement[]>;

/**
 * Indexes source blocks only after they have been committed to the preview
 * tree. Paged.js may clone a block when it crosses a page boundary, so an
 * anchor deliberately owns every rendered fragment rather than assuming one
 * DOM match per source location.
 */
export class SourceAnchorIndex {
  private anchors: IndexedAnchor[] = [];

  public rebuild(root: ParentNode): void {
    const byId = new Map<string, {
      startLine: number;
      endLine: number;
      elements: HTMLElement[];
    }>();

    root.querySelectorAll<HTMLElement>('[data-source-id]').forEach(element => {
      const id = element.dataset.sourceId;
      const startLine = Number(element.dataset.sourceStart);
      const endLine = Number(element.dataset.sourceEnd);
      if (!id || !Number.isInteger(startLine) || !Number.isInteger(endLine)) return;

      const existing = byId.get(id);
      if (existing) {
        existing.elements.push(element);
        return;
      }
      byId.set(id, {
        startLine,
        endLine: Math.max(startLine, endLine),
        elements: [element]
      });
    });

    this.anchors = Array.from(byId, ([id, anchor]) => ({
      id,
      startLine: anchor.startLine,
      endLine: anchor.endLine,
      value: anchor.elements
    }));
  }

  public resolve(line: number): ResolvedPreviewAnchor | null {
    const anchor = resolveSourceAnchor(this.anchors, line);
    if (!anchor) return null;
    return {
      id: anchor.id,
      startLine: anchor.startLine,
      endLine: anchor.endLine,
      elements: anchor.value
    };
  }

  public clear(): void {
    this.anchors = [];
  }
}
