/**
 * Coalesces CodeMirror document changes into durable autosaves.
 *
 * It writes only the latest version after the user pauses typing, and can be
 * flushed at navigation, export, and close boundaries. It never modifies the
 * editor document, so CodeMirror history remains available for undo/redo.
 */
export class DocumentSaveCoordinator<T = string> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Wrapped so a null-like value (such as an empty string) still counts as pending.
  private pending: { readonly value: T } | null = null;
  private commitQueue: Promise<void> = Promise.resolve();
  private inFlightCommits = 0;
  private readonly commit: (value: T) => void | Promise<void>;
  private readonly onBackgroundError: (error: unknown) => void;
  private readonly delayMs: number;

  constructor(
    commit: (value: T) => void | Promise<void>,
    onBackgroundError: (error: unknown) => void,
    delayMs = 750
  ) {
    this.commit = commit;
    this.onBackgroundError = onBackgroundError;
    this.delayMs = delayMs;
  }

  hasUnsavedChanges(): boolean {
    return this.pending !== null || this.inFlightCommits > 0;
  }

  schedule(value: T): void {
    this.pending = { value };
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
    if (this.pending === null) return this.commitQueue;

    const { value } = this.pending;
    this.pending = null;
    this.inFlightCommits += 1;
    this.commitQueue = this.commitQueue.catch(() => undefined).then(async () => {
      try {
        await this.commit(value);
      } catch (error) {
        if (this.pending === null) this.pending = { value };
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
    this.pending = null;
  }
}
