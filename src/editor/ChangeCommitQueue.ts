/**
 * Serializes debounced editor persistence and makes the pending value
 * explicitly flushable at navigation/export/window-close boundaries.
 */
export class ChangeCommitQueue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingValue: string | null = null;
  private commitQueue: Promise<void> = Promise.resolve();
  private inFlightCommits = 0;
  private readonly commit: (value: string) => void | Promise<void>;
  private readonly onBackgroundError: (error: unknown) => void;
  private readonly delayMs: number;

  constructor(
    commit: (value: string) => void | Promise<void>,
    onBackgroundError: (error: unknown) => void,
    delayMs = 300
  ) {
    this.commit = commit;
    this.onBackgroundError = onBackgroundError;
    this.delayMs = delayMs;
  }

  hasUnsavedChanges(): boolean {
    return this.pendingValue !== null || this.inFlightCommits > 0;
  }

  schedule(value: string): void {
    this.pendingValue = value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(this.onBackgroundError);
    }, this.delayMs);
  }

  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingValue === null) return this.commitQueue;

    const value = this.pendingValue;
    this.pendingValue = null;
    this.inFlightCommits += 1;
    this.commitQueue = this.commitQueue.catch(() => undefined).then(async () => {
      try {
        await this.commit(value);
      } catch (error) {
        if (this.pendingValue === null) {
          this.pendingValue = value;
        }
        throw error;
      } finally {
        this.inFlightCommits = Math.max(0, this.inFlightCommits - 1);
      }
    });
    return this.commitQueue;
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pendingValue = null;
  }
}
