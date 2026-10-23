import type { ImageSetup, ProjectSettingsPatch, WorkspaceRef, SectionPlacement } from '../types';
import type { WorkspaceSession } from '../platform/types';
import { state, type AppState } from '../state';
import { projectServiceFor, type ProjectServiceApi } from './ProjectService';
import { settingsServiceFor, type SettingsServiceApi } from './SettingsService';

/**
 * The lifecycle of the one project that may be open in the application.
 *
 * `activating` exists so that callers never have to infer "a project is on its
 * way in" from application state. Snapshot loading is asynchronous, so there is
 * a window in which a project is being opened but no project state has been
 * published yet. Code that reads `state.current.projectRef` to answer "is a
 * project open?" sees `null` during that window and can wrongly conclude the
 * application is idle.
 */
export type ProjectLifecycleStatus = 'closed' | 'activating' | 'open';

/**
 * Owns the lifecycle of the one project that may be open in the application.
 * Project settings can only be saved through the active workspace session.
 *
 * This store is the single authority on whether a project is present. Nothing
 * else decides that a project is absent; callers ask `isProjectPresent()` and
 * observe `onStatusChanged()`.
 */
export class ProjectSessionStore {
  private readonly appState: AppState;
  private readonly projectService: ProjectServiceApi;
  private readonly settingsService: SettingsServiceApi;
  private session: WorkspaceSession | null = null;
  private activationGeneration = 0;
  private status: ProjectLifecycleStatus = 'closed';
  private readonly statusListeners = new Set<(status: ProjectLifecycleStatus) => void>();

  /** Publishes to the global app state unless given another, e.g. an isolated test state. */
  constructor(appState: AppState = state) {
    this.appState = appState;
    this.projectService = projectServiceFor(appState);
    this.settingsService = settingsServiceFor(appState);
  }

  getSession(): WorkspaceSession | null {
    return this.session;
  }

  getStatus(): ProjectLifecycleStatus {
    return this.status;
  }

  /**
   * The single definition of "a project is present".
   *
   * True from the moment an open begins, because snapshot loading is
   * asynchronous and published project state therefore lags the lifecycle, and
   * true for as long as project state remains published. Callers that need to
   * know whether the application is idle ask this instead of reading
   * `state.current.projectRef`, which reads `null` mid-activation.
   */
  isProjectPresent(): boolean {
    return this.status !== 'closed' || this.appState.current.projectRef !== null;
  }

  onStatusChanged(listener: (status: ProjectLifecycleStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(next: ProjectLifecycleStatus): void {
    if (this.status === next) return;
    this.status = next;
    // Copy first: a listener may add or remove listeners while reacting.
    for (const listener of [...this.statusListeners]) listener(next);
  }

  requireSession(): WorkspaceSession {
    if (!this.session) throw new Error('No project is open.');
    return this.session;
  }

  async activate(ref: WorkspaceRef, session: WorkspaceSession): Promise<void> {
    const generation = ++this.activationGeneration;
    const previousStatus = this.status;
    // Publish the pending open before yielding, so no observer can mistake the
    // snapshot-loading window for "no project".
    this.setStatus('activating');

    let snapshot: Awaited<ReturnType<ProjectServiceApi['loadProjectSnapshotCandidate']>>;
    try {
      snapshot = await this.projectService.loadProjectSnapshotCandidate(session, ref);
    } catch (error) {
      // A superseded activation must not undo the status its successor set.
      if (generation === this.activationGeneration) this.setStatus(previousStatus);
      throw error;
    }
    if (generation !== this.activationGeneration) return;

    // Both writes are synchronous and happen only after the candidate project
    // has been read successfully, preserving the previous active project on
    // any open/snapshot failure.
    this.session = session;
    this.setStatus('open');
    this.appState.activateProjectSnapshot(snapshot);
  }

  async updateSettings(patch: ProjectSettingsPatch): Promise<void> {
    await this.settingsService.saveSettings(this.requireSession(), patch);
    this.applySettingsPatch(patch);
  }

  /** Persist an image-default reset across all sections, then save those defaults. */
  async resetImagePresentation(setup: ImageSetup): Promise<Array<{ path: string; content: string }>> {
    const session = this.requireSession();
    const changed = await this.projectService.resetProjectImagePresentation(session, setup);
    await this.settingsService.saveSettings(session, { imageSetup: setup });
    this.applySettingsPatch({ imageSetup: setup });
    return changed;
  }

  async toggleHeaderVisibility(path: string, hide: boolean): Promise<boolean> {
    return this.projectService.toggleHeaderVisibility(this.requireSession(), path, hide);
  }

  async toggleFooterVisibility(path: string, hide: boolean): Promise<boolean> {
    return this.projectService.toggleFooterVisibility(this.requireSession(), path, hide);
  }

  async toggleHeadingNumbering(path: string, enabled: boolean): Promise<boolean> {
    return this.projectService.toggleHeadingNumbering(this.requireSession(), path, enabled);
  }

  async toggleToc(path: string, enabled: boolean): Promise<boolean> {
    return this.projectService.toggleToc(this.requireSession(), path, enabled);
  }

  async togglePageBreak(path: string): Promise<boolean> {
    return this.projectService.togglePageBreak(this.requireSession(), path);
  }

  async createSection(name: string, content?: string): Promise<boolean> {
    return this.projectService.createSection(this.requireSession(), name, content);
  }

  async createFolder(name: string): Promise<boolean> {
    return this.projectService.createFolder(this.requireSession(), name);
  }

  async renameSection(oldName: string, newName: string): Promise<boolean> {
    return this.projectService.renameSection(this.requireSession(), oldName, newName);
  }

  async deleteSection(name: string): Promise<boolean> {
    return this.projectService.deleteSection(this.requireSession(), name);
  }

  async moveSection(source: string, target: string | null, placement: SectionPlacement): Promise<boolean> {
    return this.projectService.moveSection(this.requireSession(), source, target, placement);
  }

  async reorderSection(source: string, target: string, placement: Extract<SectionPlacement, 'before' | 'after'>): Promise<boolean> {
    return this.projectService.reorderSection(this.requireSession(), source, target, placement);
  }

  async uploadImage(filename: string, data: Uint8Array<ArrayBuffer>): Promise<boolean> {
    return this.projectService.uploadImage(this.requireSession(), filename, data);
  }

  private applySettingsPatch(patch: ProjectSettingsPatch): void {
    if (patch.pageSetup) this.appState.setPageSetup(patch.pageSetup);
    if (patch.typographySetup) this.appState.setTypographySetup(patch.typographySetup);
    if (patch.listSetup) this.appState.setListSetup(patch.listSetup);
    if (patch.tableSetup) this.appState.setTableSetup(patch.tableSetup);
    if (patch.imageSetup) this.appState.setImageSetup(patch.imageSetup);
    if (patch.projectMetadata) this.appState.setProjectMetadata(patch.projectMetadata);
    if (patch.customStyles) this.appState.setCustomStyles(patch.customStyles);
    if (patch.customBlockStyles) this.appState.setCustomBlockStyles(patch.customBlockStyles);
    if (patch.editorSetup) this.appState.setEditorSetup(patch.editorSetup);
  }

  close(): void {
    this.activationGeneration += 1;
    this.session = null;
    this.setStatus('closed');
    this.appState.closeProject();
  }
}

export const projectSession = new ProjectSessionStore();
