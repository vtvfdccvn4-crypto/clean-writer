import type { CommittedPreviewTarget } from './CommittedPreviewIndex';
import { comparePreviewTargetsByPage, resolveSourceLineTarget } from './PreviewTargetSelection';

/** A source location shared by the editor and a rendered preview block. */
export interface LinkedScrollAnchor {
  line: number;
}

/**
 * Minimal pane adapter for linked scrolling. Application code supplies the
 * editor/preview-specific geometry; this module deliberately imports neither
 * CodeMirror nor PreviewController.
 */
export interface LinkedScrollPane {
  readonly scrollElement: HTMLElement;
  anchorAtViewportFraction(viewportFraction: number): LinkedScrollAnchor | null;
  scrollAnchorToViewportFraction(anchor: LinkedScrollAnchor, viewportFraction: number): void;
}

export interface LinkedScrollControllerOptions {
  editor: LinkedScrollPane;
  preview: LinkedScrollPane;
  /** Fraction of each pane used to establish the shared reading position. */
  viewportFraction?: number;
}

type PaneName = 'editor' | 'preview';
const LEADER_GRACE_PERIOD_MS = 120;

/**
 * An opt-in controller for semantic, bidirectional linked scrolling.
 *
 * This is intentionally a standalone module. It has no application wiring:
 * callers must provide pane adapters and choose when to construct it.
 */
export class LinkedScrollController {
  private readonly editor: LinkedScrollPane;
  private readonly preview: LinkedScrollPane;
  private readonly viewportFraction: number;
  private frame: number | null = null;
  private pendingLeader: PaneName | null = null;
  private suppressedScroll: { pane: PaneName; scrollTop: number } | null = null;
  private activeLeader: { pane: PaneName; until: number } | null = null;
  private enabled = false;

  constructor(options: LinkedScrollControllerOptions) {
    this.editor = options.editor;
    this.preview = options.preview;
    this.viewportFraction = clampViewportFraction(options.viewportFraction ?? 0.5);
  }

  public enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.editor.scrollElement.addEventListener('scroll', this.handleEditorScroll, { passive: true });
    this.preview.scrollElement.addEventListener('scroll', this.handlePreviewScroll, { passive: true });
  }

  public disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.editor.scrollElement.removeEventListener('scroll', this.handleEditorScroll);
    this.preview.scrollElement.removeEventListener('scroll', this.handlePreviewScroll);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.pendingLeader = null;
    this.suppressedScroll = null;
    this.activeLeader = null;
  }

  public destroy(): void {
    this.disable();
  }

  private readonly handleEditorScroll = (): void => this.queueSync('editor');
  private readonly handlePreviewScroll = (): void => this.queueSync('preview');

  private queueSync(leader: PaneName): void {
    if (!this.enabled) return;
    const now = performance.now();
    // A follower can emit queued scroll events from an earlier frame after a
    // newer leader scroll has already moved it again. Keep the user's pane in
    // charge briefly so those delayed events never reverse the direction.
    if (this.activeLeader && this.activeLeader.pane !== leader && now < this.activeLeader.until) return;
    if (this.suppressedScroll?.pane === leader) {
      const pane = leader === 'editor' ? this.editor : this.preview;
      const isExpectedFollowerPosition = Math.abs(pane.scrollElement.scrollTop - this.suppressedScroll.scrollTop) < 1;
      this.suppressedScroll = null;
      if (isExpectedFollowerPosition) return;
    }
    this.activeLeader = { pane: leader, until: now + LEADER_GRACE_PERIOD_MS };
    this.pendingLeader = leader;
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const pendingLeader = this.pendingLeader;
      this.pendingLeader = null;
      if (pendingLeader) this.syncFrom(pendingLeader);
    });
  }

  private syncFrom(leaderName: PaneName): void {
    const leader = leaderName === 'editor' ? this.editor : this.preview;
    const followerName: PaneName = leaderName === 'editor' ? 'preview' : 'editor';
    const follower = followerName === 'editor' ? this.editor : this.preview;
    const anchor = leader.anchorAtViewportFraction(this.viewportFraction);
    if (!anchor) return;

    const previousScrollTop = follower.scrollElement.scrollTop;
    follower.scrollAnchorToViewportFraction(anchor, this.viewportFraction);
    const nextScrollTop = follower.scrollElement.scrollTop;
    // Ignore only the scroll event associated with this exact write. If the
    // pane did not move, no event is expected and no later user event is lost.
    this.suppressedScroll = Math.abs(nextScrollTop - previousScrollTop) >= 1
      ? { pane: followerName, scrollTop: nextScrollTop }
      : null;
  }
}

/** Selects the best rendered preview copy for a source line. */
export function resolvePreviewTargetForLine(
  targets: readonly CommittedPreviewTarget[],
  line: number
): CommittedPreviewTarget | null {
  return resolveSourceLineTarget(targets, line, 'preceding', comparePreviewTargetsByPage);
}

/** Converts a target's document position into a bounded follower scroll top. */
export function calculateLinkedScrollTop(
  targetDocumentTop: number,
  followerViewportHeight: number,
  followerScrollHeight: number,
  viewportFraction = 0.5
): number {
  const desiredTop = targetDocumentTop - (followerViewportHeight * clampViewportFraction(viewportFraction));
  return Math.min(Math.max(0, desiredTop), Math.max(0, followerScrollHeight - followerViewportHeight));
}

function clampViewportFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}
