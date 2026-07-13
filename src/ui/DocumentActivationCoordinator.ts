import { CoalescingTaskQueue } from '../utils/CoalescingTaskQueue';
import { DocumentNavigationController } from './DocumentNavigationController';

export interface DocumentActivationDependencies {
  flushCurrentDocument(): Promise<void>;
  setActiveFile(path: string): void;
  activate(isLatest: () => boolean): Promise<void>;
  reportError(reason: string, error: unknown): void;
  isCurrentDocument(path: string): boolean;
}

/** Owns document activation scheduling, supersession, and readiness waiting. */
export class DocumentActivationCoordinator {
  private readonly dependencies: DocumentActivationDependencies;
  private readonly selectionQueue: CoalescingTaskQueue<string>;
  private readonly navigation = new DocumentNavigationController();
  private navigationCommandActive = false;

  constructor(dependencies: DocumentActivationDependencies) {
    this.dependencies = dependencies;
    this.selectionQueue = new CoalescingTaskQueue(
      async (_reason, isLatest) => this.dependencies.activate(isLatest),
      (reason, error) => this.dependencies.reportError(reason, error)
    );
  }

  isNavigationCommandActive(): boolean {
    return this.navigationCommandActive;
  }

  request(reason: string): void {
    this.selectionQueue.request(reason);
  }

  async whenReady(path: string): Promise<void> {
    await this.selectionQueue.whenIdle();
    if (!this.dependencies.isCurrentDocument(path)) {
      throw new Error(`Document activation did not settle on ${path}.`);
    }
  }

  async openDocument(path: string): Promise<void> {
    await this.dependencies.flushCurrentDocument();
    this.navigationCommandActive = true;
    try {
      this.dependencies.setActiveFile(path);
    } finally {
      this.navigationCommandActive = false;
    }

    await this.navigation.navigate(async isCurrent => {
      for (let attempt = 0; attempt < 3 && isCurrent(); attempt += 1) {
        await this.dependencies.activate(isCurrent);
        if (this.dependencies.isCurrentDocument(path)) return;
      }
      if (isCurrent()) throw new Error(`Unable to activate document: ${path}`);
    });
  }
}
