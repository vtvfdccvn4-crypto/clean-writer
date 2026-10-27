/**
 * What the live preview shows while the editor is ahead of it:
 * - `typing`: edits keep arriving, so the preview shows the last completed revision.
 * - `updating`: the pause has passed and the newest text is compiling.
 */
export type LivePreviewFreshnessState = 'typing' | 'updating';

/** Shown after this delay, so a refresh that finishes quickly does not flash the notice. */
export const LIVE_FRESHNESS_REVEAL_MS = 400;

/**
 * Tracks whether the live preview is behind the editor and tells the page what to show. The notice
 * appears only if the state lasts for the reveal delay, and clears when the newest revision renders.
 */
export class LivePreviewFreshness {
  private readonly show: (state: LivePreviewFreshnessState | null) => void;
  private readonly revealAfterMs: number;
  private pending: LivePreviewFreshnessState | null = null;
  private shown: LivePreviewFreshnessState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(show: (state: LivePreviewFreshnessState | null) => void, revealAfterMs = LIVE_FRESHNESS_REVEAL_MS) {
    this.show = show;
    this.revealAfterMs = revealAfterMs;
  }

  /** An edit arrived: the preview is behind until the next refresh completes. */
  typing(): void {
    this.set('typing');
  }

  /** The pause has passed and the newest text is compiling. */
  updating(): void {
    this.set('updating');
  }

  /** The newest revision has rendered, or the document changed: nothing is pending. */
  settled(): void {
    this.set(null);
  }

  private set(state: LivePreviewFreshnessState | null): void {
    this.pending = state;
    if (state === null) {
      this.clearTimer();
      if (this.shown !== null) {
        this.shown = null;
        this.show(null);
      }
      return;
    }
    if (this.shown !== null) {
      if (this.shown !== state) {
        this.shown = state;
        this.show(state);
      }
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.pending === null) return;
        this.shown = this.pending;
        this.show(this.pending);
      }, this.revealAfterMs);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
