import type { ProjectSettingsPatch, WorkspaceRef, SectionPlacement } from '../types';
import type { WorkspaceSession } from '../platform/types';
import { state } from '../state';
import { ProjectService } from './ProjectService';
import { SettingsService } from './SettingsService';

/**
 * Owns the lifecycle of the one project that may be open in the application.
 * Project settings can only be saved through the active workspace session.
 */
export class ProjectSessionStore {
  private session: WorkspaceSession | null = null;

  getSession(): WorkspaceSession | null {
    return this.session;
  }

  requireSession(): WorkspaceSession {
    if (!this.session) throw new Error('No project is open.');
    return this.session;
  }

  async activate(ref: WorkspaceRef, session: WorkspaceSession): Promise<void> {
    this.session = session;
    state.setProjectRef(ref);
    await ProjectService.loadProjectSnapshot(session);
    state.setFullDocMode();
  }

  async updateSettings(patch: ProjectSettingsPatch): Promise<void> {
    this.applySettingsPatch(patch);
    await SettingsService.saveSettings(this.requireSession(), patch);
  }

  async toggleHeaderVisibility(path: string, hide: boolean): Promise<boolean> {
    return ProjectService.toggleHeaderVisibility(this.requireSession(), path, hide);
  }

  async toggleFooterVisibility(path: string, hide: boolean): Promise<boolean> {
    return ProjectService.toggleFooterVisibility(this.requireSession(), path, hide);
  }

  async toggleHeadingNumbering(path: string, enabled: boolean): Promise<boolean> {
    return ProjectService.toggleHeadingNumbering(this.requireSession(), path, enabled);
  }

  async toggleToc(path: string, enabled: boolean): Promise<boolean> {
    return ProjectService.toggleToc(this.requireSession(), path, enabled);
  }

  async togglePageBreak(path: string): Promise<boolean> {
    return ProjectService.togglePageBreak(this.requireSession(), path);
  }

  async createSection(name: string, content?: string): Promise<boolean> {
    return ProjectService.createSection(this.requireSession(), name, content);
  }

  async createFolder(name: string): Promise<boolean> {
    return ProjectService.createFolder(this.requireSession(), name);
  }

  async renameSection(oldName: string, newName: string): Promise<boolean> {
    return ProjectService.renameSection(this.requireSession(), oldName, newName);
  }

  async deleteSection(name: string): Promise<boolean> {
    return ProjectService.deleteSection(this.requireSession(), name);
  }

  async moveSection(source: string, target: string | null, placement: SectionPlacement): Promise<boolean> {
    return ProjectService.moveSection(this.requireSession(), source, target, placement);
  }

  async uploadImage(filename: string, data: Uint8Array): Promise<boolean> {
    return ProjectService.uploadImage(this.requireSession(), filename, data);
  }

  private applySettingsPatch(patch: ProjectSettingsPatch): void {
    if (patch.pageSetup) state.setPageSetup(patch.pageSetup);
    if (patch.typographySetup) state.setTypographySetup(patch.typographySetup);
    if (patch.listSetup) state.setListSetup(patch.listSetup);
    if (patch.tableSetup) state.setTableSetup(patch.tableSetup);
    if (patch.imageSetup) state.setImageSetup(patch.imageSetup);
    if (patch.projectMetadata) state.setProjectMetadata(patch.projectMetadata);
    if (patch.customStyles) state.setCustomStyles(patch.customStyles);
    if (patch.customBlockStyles) state.setCustomBlockStyles(patch.customBlockStyles);
    if (patch.editorSetup) state.setEditorSetup(patch.editorSetup);
  }

  close(): void {
    this.session = null;
    state.closeProject();
  }
}

export const projectSession = new ProjectSessionStore();
