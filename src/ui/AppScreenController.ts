export interface AppScreenControllerDependencies {
  welcomeScreen: HTMLElement;
  workspaceScreen: HTMLElement;
  workspaceStatusBar: HTMLElement;
}

/** Keeps the standalone welcome screen and the workspace mutually exclusive. */
export class AppScreenController {
  private readonly welcomeScreen: HTMLElement;
  private readonly workspaceScreen: HTMLElement;
  private readonly workspaceStatusBar: HTMLElement;

  constructor(dependencies: AppScreenControllerDependencies) {
    this.welcomeScreen = dependencies.welcomeScreen;
    this.workspaceScreen = dependencies.workspaceScreen;
    this.workspaceStatusBar = dependencies.workspaceStatusBar;
  }

  showWelcome(): void {
    this.workspaceScreen.hidden = true;
    this.workspaceStatusBar.hidden = true;
    this.welcomeScreen.hidden = false;
  }

  showWorkspace(): void {
    this.welcomeScreen.hidden = true;
    this.workspaceScreen.hidden = false;
    this.workspaceStatusBar.hidden = false;
  }
}
