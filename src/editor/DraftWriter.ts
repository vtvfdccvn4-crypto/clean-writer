import type { DraftStore, DraftTarget } from './DraftStore';

export interface DraftWriterOptions {
  /** Quiet period after the last edit before a draft is written. */
  readonly debounceMs?: number;
  /** Longest a draft may wait during continuous typing, so loss stays bounded. */
  readonly maxWaitMs?: number;
  /** Delay before retrying a draft whose write failed. */
  readonly retryMs?: number;
}

/** Anything whose string form is the section text, such as an editor snapshot. */
export interface DraftText {
  toString(): string;
}

interface PendingDraft {
  readonly target: DraftTarget;
  readonly text: DraftText;
  readonly baseHash: string;
  readonly queuedAt: number;
}

const DEFAULT_DEBOUNCE_MS = 1_000;
const DEFAULT_MAX_WAIT_MS = 5_000;
const DEFAULT_RETRY_MS = 10_000;

function keyOf(target: DraftTarget): string {
  return `${target.projectId}\u0000${target.path}`;
}

/**
 * Coalesces edits into draft writes. Writes and discards for one section run
 * in order, so a discard can never be undone by an older write still in flight.
 * Callers pass a snapshot and the text is produced only when a write runs, so
 * no document-wide copy happens on each keystroke.
 */
export class DraftWriter {
  private readonly store: DraftStore;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly retryMs: number;
  private readonly pending = new Map<string, PendingDraft>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly chains = new Map<string, Promise<void>>();

  constructor(store: DraftStore, options: DraftWriterOptions = {}) {
    this.store = store;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    this.retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  }

  /** Records the latest text for a section and arms its write timer. */
  schedule(target: DraftTarget, text: DraftText, baseHash: string): void {
    const key = keyOf(target);
    const queuedAt = this.pending.get(key)?.queuedAt ?? Date.now();
    this.pending.set(key, { target, text, baseHash, queuedAt });
    const remainingWait = queuedAt + this.maxWaitMs - Date.now();
    this.arm(key, Math.min(this.debounceMs, Math.max(0, remainingWait)));
  }

  /** Writes every pending draft now and resolves when all queued writes have settled. */
  flush(): Promise<void> {
    const keys = new Set([...this.pending.keys(), ...this.chains.keys()]);
    return Promise.all([...keys].map(key => this.flushKey(key))).then(() => undefined);
  }

  /**
   * Called after a save succeeds. A pending draft is dropped only when it holds
   * the saved text; newer edits keep their draft. A stored draft with the saved
   * text is then deleted.
   */
  discardWhenSaved(target: DraftTarget, savedContent: string): Promise<void> {
    const key = keyOf(target);
    const pending = this.pending.get(key);
    if (pending && pending.text.toString() === savedContent) {
      this.clearTimer(key);
      this.pending.delete(key);
    }
    return this.enqueue(key, () => this.store.discardIfSaved(target, savedContent));
  }

  private arm(key: string, delayMs: number): void {
    this.clearTimer(key);
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      void this.flushKey(key);
    }, delayMs));
  }

  private clearTimer(key: string): void {
    const timer = this.timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(key);
  }

  private flushKey(key: string): Promise<void> {
    this.clearTimer(key);
    const pending = this.pending.get(key);
    if (!pending) return this.chains.get(key) ?? Promise.resolve();
    this.pending.delete(key);
    return this.enqueue(key, async () => {
      const written = await this.store.write(pending.target, pending.text.toString(), pending.baseHash);
      // A failed write keeps the draft queued unless a newer edit already replaced it.
      if (!written && !this.pending.has(key)) {
        this.pending.set(key, { ...pending, queuedAt: Date.now() });
        this.arm(key, this.retryMs);
      }
    });
  }

  private enqueue(key: string, operation: () => Promise<unknown>): Promise<void> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous.then(operation).then(() => undefined, () => undefined);
    this.chains.set(key, next);
    void next.then(() => {
      if (this.chains.get(key) === next) this.chains.delete(key);
    });
    return next;
  }
}
