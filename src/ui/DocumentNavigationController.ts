/** Serializes explicit document transitions and exposes their completion. */
export class DocumentNavigationController {
  private tail: Promise<void> = Promise.resolve();
  private revision = 0;

  navigate(run: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    const revision = ++this.revision;
    const work = this.tail.catch(() => undefined).then(() => run(() => revision === this.revision));
    this.tail = work.catch(() => undefined);
    return work;
  }
}
