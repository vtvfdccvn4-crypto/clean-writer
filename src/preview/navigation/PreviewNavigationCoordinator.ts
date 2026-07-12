import type { CommittedPreviewTarget } from './CommittedPreviewIndex';

export interface SourceNavigationIndex {
  resolve(line: number): CommittedPreviewTarget | null;
}

interface NavigationRequest {
  line: number;
  revision: number;
}

/**
 * Ensures source navigation only targets a fully committed preview matching
 * the editor revision that requested it.
 */
export class PreviewNavigationCoordinator {
  private committedIndex: SourceNavigationIndex | null = null;
  private committedRevision: number | null = null;
  private pendingRenderRevision: number | null = null;
  private pendingRequest: NavigationRequest | null = null;
  private readonly revealTarget: (target: CommittedPreviewTarget) => void;

  constructor(revealTarget: (target: CommittedPreviewTarget) => void) {
    this.revealTarget = revealTarget;
  }

  public beginRender(revision: number) {
    this.pendingRenderRevision = revision;
    if (this.pendingRequest && this.pendingRequest.revision < revision) {
      this.pendingRequest = null;
    }
  }

  public commitRender(revision: number, index: SourceNavigationIndex) {
    if (this.pendingRenderRevision !== null && revision < this.pendingRenderRevision) return;

    this.committedIndex = index;
    this.committedRevision = revision;
    if (this.pendingRenderRevision === revision) this.pendingRenderRevision = null;
    this.flushPendingRequest();
  }

  public requestNavigation(line: number, revision: number) {
    if (this.canNavigate(revision)) {
      this.reveal(line);
      return;
    }
    this.pendingRequest = { line, revision };
  }

  public clear() {
    this.committedIndex = null;
    this.committedRevision = null;
    this.pendingRenderRevision = null;
    this.pendingRequest = null;
  }

  private canNavigate(revision: number): boolean {
    return this.committedIndex !== null
      && this.committedRevision === revision
      && this.pendingRenderRevision !== revision;
  }

  private flushPendingRequest() {
    const request = this.pendingRequest;
    if (!request || !this.canNavigate(request.revision)) return;
    this.pendingRequest = null;
    this.reveal(request.line);
  }

  private reveal(line: number) {
    const target = this.committedIndex?.resolve(line);
    if (target) this.revealTarget(target);
  }
}
