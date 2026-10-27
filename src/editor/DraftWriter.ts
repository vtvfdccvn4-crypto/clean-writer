import type { DraftStore, DraftTarget } from './DraftStore';

export interface DraftWriterOptions {
  /** Quiet period after the last edit before a draft is written. */
  readonly debounceMs?: number;
  /**
   * Longest a draft may wait during continuous typing, so loss stays bounded. A fixed number applies to
   * every document; by default the wait grows with the document, from about one second to five.
   */
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
/** Typing loses at most this long for an ordinary document. */
const MIN_MAX_WAIT_MS = 1_000;
/** A very large document is converted to text and hashed for each write, so it is written less often. */
const MAX_MAX_WAIT_MS = 5_000;
/** Above this many characters, continuous typing may wait longer for a recovery draft. */
export const LARGE_DRAFT_DOCUMENT_CHARACTERS = 200_000;
/** Shown once for each large section, so the longer window is stated where the writer sees it. */
export const LARGE_DRAFT_NOTICE = 'This section is over 200,000 characters. If the browser crashes while you type without pausing, up to 5 seconds of typing may not be recovered (1 second in shorter sections). Download a backup from the project toolbar to keep a copy.';
const SLOWEST_DOCUMENT_CHARACTERS = 1_000_000;

/** How long a draft may wait, by document size: one second up to 200,000 characters, rising to five at 1,000,000. */
export function draftMaxWaitMs(characters: number): number {
  if (characters <= LARGE_DRAFT_DOCUMENT_CHARACTERS) return MIN_MAX_WAIT_MS;
  const share = Math.min(1, (characters - LARGE_DRAFT_DOCUMENT_CHARACTERS) / (SLOWEST_DOCUMENT_CHARACTERS - LARGE_DRAFT_DOCUMENT_CHARACTERS));
  return Math.round(MIN_MAX_WAIT_MS + share * (MAX_MAX_WAIT_MS - MIN_MAX_WAIT_MS));
}
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
  private readonly maxWaitMs: number | null;
  private readonly retryMs: number;
  private readonly pending = new Map<string, PendingDraft>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly chains = new Map<string, Promise<void>>();

  constructor(store: DraftStore, options: DraftWriterOptions = {}) {
    this.store = store;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? null;
    this.retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  }

  /**
   * Records the latest text for a section and arms its write timer. `characters` is the document's length,
   * which sets how long continuous typing may wait; it is passed in so the text is not built to measure it.
   */
  schedule(target: DraftTarget, text: DraftText, baseHash: string, characters = 0): void {
    const key = keyOf(target);
    const queuedAt = this.pending.get(key)?.queuedAt ?? Date.now();
    this.pending.set(key, { target, text, baseHash, queuedAt });
    const remainingWait = queuedAt + (this.maxWaitMs ?? draftMaxWaitMs(characters)) - Date.now();
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
   * text is then deleted. When the saved text is known to be the newest edit
   * (`latest`), every earlier draft of the section is stale, including one
   * written for text typed before the save, so it is deleted too.
   */
  discardWhenSaved(target: DraftTarget, savedContent: string, latest = false): Promise<void> {
    const key = keyOf(target);
    const pending = this.pending.get(key);
    if (pending && (latest || pending.text.toString() === savedContent)) {
      this.clearTimer(key);
      this.pending.delete(key);
    }
    return this.enqueue(key, () => latest ? this.store.discard(target) : this.store.discardIfSaved(target, savedContent));
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
