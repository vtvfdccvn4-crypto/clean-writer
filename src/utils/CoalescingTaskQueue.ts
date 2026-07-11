export class CoalescingTaskQueue<T> {
  private requestVersion = 0;
  private latestValue: T | undefined;
  private scheduled = false;
  private idlePromise: Promise<void> = Promise.resolve();
  private readonly run: (value: T, isLatest: () => boolean) => Promise<void>;
  private readonly onError: (value: T, error: unknown) => void;

  constructor(
    run: (value: T, isLatest: () => boolean) => Promise<void>,
    onError: (value: T, error: unknown) => void
  ) {
    this.run = run;
    this.onError = onError;
  }

  request(value: T): void {
    this.latestValue = value;
    this.requestVersion += 1;
    if (this.scheduled) return;

    this.scheduled = true;
    this.idlePromise = this.drain();
  }

  whenIdle(): Promise<void> {
    return this.idlePromise;
  }

  private async drain(): Promise<void> {
    // Let state publishers finish their current synchronous burst first.
    await Promise.resolve();

    try {
      while (this.latestValue !== undefined) {
        const value = this.latestValue;
        const version = this.requestVersion;
        const isLatest = () => version === this.requestVersion;

        try {
          await this.run(value, isLatest);
        } catch (error) {
          this.onError(value, error);
        }

        if (isLatest()) break;
        await Promise.resolve();
      }
    } finally {
      this.scheduled = false;
    }
  }
}
