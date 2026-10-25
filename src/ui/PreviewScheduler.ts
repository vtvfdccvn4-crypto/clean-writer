/**
 * Runs preview refreshes after a pause in editing, keeping only the newest
 * request. It is independent of autosave: a preview refresh no longer waits for
 * the save debounce, and a save never starts a preview refresh.
 */
export class PreviewScheduler<T> {
  private readonly run: (value: T) => void;
  private readonly delayMs: () => number;
  private pending: { readonly value: T } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(run: (value: T) => void, delayMs: () => number) {
    this.run = run;
    this.delayMs = delayMs;
  }

  /** Replaces any waiting request and restarts the pause timer. */
  schedule(value: T): void {
    this.pending = { value };
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const request = this.pending;
      this.pending = null;
      if (request) this.run(request.value);
    }, this.delayMs());
  }

  /** Drops the waiting request, for example when another document is opened. */
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
