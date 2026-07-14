import type { WorkspaceRepository } from '../platform/types';

export interface WelcomeControllerDependencies {
  welcomeContainer: HTMLElement;
  workspaceRepository: WorkspaceRepository;
}

/** Owns the standalone welcome screen shown when no project is open. */
export class WelcomeController {
  private readonly welcomeContainer: HTMLElement;
  private readonly workspaceRepository: WorkspaceRepository;

  constructor(dependencies: WelcomeControllerDependencies) {
    this.welcomeContainer = dependencies.welcomeContainer;
    this.workspaceRepository = dependencies.workspaceRepository;
  }

  destroy(): void {
    this.welcomeContainer.replaceChildren();
  }

  render(): void {
    this.welcomeContainer.innerHTML = `
      <div class="empty-canvas welcome-screen">
        <div class="welcome-content">
          <header class="welcome-brand">
            <span class="welcome-brand-mark" aria-hidden="true">C</span>
            <h1>Clear Writer</h1>
          </header>
          <section class="welcome-section" aria-labelledby="welcome-start-title">
            <h2 id="welcome-start-title">Start</h2>
            <div class="welcome-actions">
              <button id="empty-canvas-new-project" type="button" class="welcome-action">
                <span class="welcome-action-icon" aria-hidden="true">+</span>
                <span>New Document</span>
              </button>
              <button id="empty-canvas-open-folder" type="button" class="welcome-action">
                <span class="welcome-action-icon welcome-action-icon-folder" aria-hidden="true"></span>
                <span>Open Document</span>
              </button>
            </div>
          </section>
          <section id="welcome-recents" class="welcome-section welcome-recents" aria-labelledby="welcome-recent-title" hidden>
            <h2 id="welcome-recent-title">Recent</h2>
            <div id="welcome-recent-list" class="welcome-recent-list"></div>
          </section>
        </div>
      </div>
    `;

    this.welcomeContainer.querySelector('#empty-canvas-open-folder')?.addEventListener('click', () => {
      document.getElementById('btn-open')?.click();
    });
    this.welcomeContainer.querySelector('#empty-canvas-new-project')?.addEventListener('click', () => {
      document.getElementById('btn-new')?.click();
    });
    void this.populateRecents();
  }

  private async populateRecents(): Promise<void> {
    const recentSection = this.welcomeContainer.querySelector<HTMLElement>('#welcome-recents');
    const recentList = this.welcomeContainer.querySelector<HTMLElement>('#welcome-recent-list');
    const listKnownWorkspaces = this.workspaceRepository.listKnownBrowserWorkspaces;
    if (!recentSection || !recentList || !listKnownWorkspaces) return;

    try {
      const recents = await listKnownWorkspaces.call(this.workspaceRepository);
      if (!this.welcomeContainer.contains(recentSection) || recents.length === 0) return;

      for (const entry of recents.slice(0, 8)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'welcome-recent-item';
        button.title = entry.displayName;

        const name = document.createElement('span');
        name.className = 'welcome-recent-name';
        name.textContent = entry.displayName;
        const kind = document.createElement('span');
        kind.className = 'welcome-recent-kind';
        kind.textContent = entry.ref.kind === 'directory' ? 'Local folder' : 'Browser storage';
        button.append(name, kind);
        button.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('clear-writer-open-recent', { detail: { ref: entry.ref } }));
        });
        recentList.append(button);
      }
      recentSection.hidden = recentList.childElementCount === 0;
    } catch (error) {
      console.warn('Unable to load recent documents for the welcome page:', error);
    }
  }
}
