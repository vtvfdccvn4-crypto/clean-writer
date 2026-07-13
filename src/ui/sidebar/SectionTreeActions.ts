import { projectSession } from '../../services/ProjectSessionStore';
import type { SectionPlacement } from '../../types';

/** Command adapter for section-tree mutations; keeps DOM rendering free of persistence details. */
export class SectionTreeActions {
  move(source: string, target: string | null, placement: SectionPlacement): Promise<boolean> {
    return projectSession.moveSection(source, target, placement);
  }

  togglePageBreak(path: string): Promise<boolean> {
    return projectSession.togglePageBreak(path);
  }

  rename(oldPath: string, newPath: string): Promise<boolean> {
    return projectSession.renameSection(oldPath, newPath);
  }

  remove(path: string): Promise<boolean> {
    return projectSession.deleteSection(path);
  }

  createFolder(path: string): Promise<boolean> {
    return projectSession.createFolder(path);
  }

  createSection(path: string, content: string): Promise<boolean> {
    return projectSession.createSection(path, content);
  }
}

export const sectionTreeActions = new SectionTreeActions();
