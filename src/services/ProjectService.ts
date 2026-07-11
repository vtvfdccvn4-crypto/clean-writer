import { state } from '../state';
import { getPathChain, isDescendantPath, normalizeExplorerPath, replacePathPrefix } from '../utils/path-utils';
import { sortSectionsByHierarchy } from '../utils/tree-utils';
import { previewMetrics } from '../perf/preview-metrics';
import type { WorkspaceSession, SectionPlacement } from '../platform/types';
import type { ProjectHealthReport } from '../types';

type PathFlagKey = 'pageBreaks' | 'hiddenHeaders' | 'hiddenFooters' | 'numberedHeadings' | 'tocSections';

// Project reads can overlap during fast navigation. Only the newest request
// may publish, preventing a slower response from restoring stale state.
let latestProjectRead = 0;
let activeWorkspaceSession: WorkspaceSession | null = null;

export const ProjectService = {
  setActiveSession(session: WorkspaceSession | null): void {
    activeWorkspaceSession = session;
  },

  async loadProjectSnapshot(session?: WorkspaceSession): Promise<void> {
    const readId = ++latestProjectRead;
    const projectRef = state.current.projectRef;
    if (!projectRef) return;

    const activeSession = session ?? getActiveSession();

    // ARCHITECTURE QA NOTE: this coarse timing is meant for trend comparisons
    // across snapshot-flow changes, not for sub-millisecond profiling.
    const started = performance.now();
    let loaded = false;
    try {
      const { sections, images, settings } = await readProjectSnapshot(activeSession);
      if (readId !== latestProjectRead || state.current.projectRef !== projectRef) return;
      state.commitProjectSnapshot({
        projectRef,
        sections,
        images,
        pageSetup: settings.pageSetup,
        typographySetup: settings.typographySetup,
        listSetup: settings.listSetup,
        tableSetup: settings.tableSetup,
        projectMetadata: settings.projectMetadata,
        customStyles: settings.customStyles,
        customBlockStyles: settings.customBlockStyles,
        editorSetup: settings.editorSetup
      });
      loaded = true;
    } catch (e) {
      if (readId !== latestProjectRead || state.current.projectRef !== projectRef) return;
      console.error('Failed to load project snapshot', e);
      throw e;
    } finally {
      const elapsed = performance.now() - started;
      previewMetrics.recordProjectSnapshotLoad(elapsed);
      if (loaded) {
        console.info(`[Perf] project snapshot ${projectRef.id}: ${previewMetrics.formatCompactSummary()}`);
      }
    }
  },

  async refreshProjectTree(sessionOrActiveFile?: WorkspaceSession | string | null, activeFile: string | null = state.current.activeFile): Promise<void> {
    const readId = ++latestProjectRead;
    const projectRef = state.current.projectRef;
    if (!projectRef) {
      state.setProjectTree([], []);
      return;
    }

    let session: WorkspaceSession;
    let finalActiveFile: string | null;

    if (typeof sessionOrActiveFile === 'string') {
      session = getActiveSession();
      finalActiveFile = sessionOrActiveFile;
    } else if (sessionOrActiveFile === null) {
      session = getActiveSession();
      finalActiveFile = null;
    } else if (sessionOrActiveFile && typeof sessionOrActiveFile === 'object' && 'listSections' in sessionOrActiveFile) {
      session = sessionOrActiveFile;
      finalActiveFile = activeFile;
    } else {
      session = getActiveSession();
      finalActiveFile = activeFile;
    }

    // Keep tree-refresh timing separate from full snapshot loads so we can
    // distinguish list-only churn from actual project reload work.
    const started = performance.now();
    try {
      const { sections, images } = await readProjectSnapshot(session);
      if (readId !== latestProjectRead || state.current.projectRef !== projectRef) return;
      state.setProjectTree(sections, images, finalActiveFile);
    } catch (e) {
      if (readId !== latestProjectRead || state.current.projectRef !== projectRef) return;
      console.error('Failed to refresh project tree', e);
      throw e;
    } finally {
      previewMetrics.recordProjectTreeRefresh(performance.now() - started);
    }
  },

  async createSection(sessionOrName: WorkspaceSession | string, name?: string, content?: string): Promise<boolean> {
    let session: WorkspaceSession;
    let finalName: string;
    if (typeof sessionOrName === 'string') {
      session = getActiveSession();
      finalName = sessionOrName;
    } else {
      session = sessionOrName;
      finalName = name!;
    }

    if (!finalName.toLowerCase().endsWith('.md')) finalName += '.md';

    const result = await session.createSection(
      finalName, 
      content ?? '# ' + finalName.replace(/\.md$/i, '') + '\n\nStart writing here...'
    );

    if (result && typeof result === 'object' && result.success) {
      await this._appendOrder(session, result.newPath || finalName);
      await this.refreshProjectTree(session, result.newPath || finalName);
      return true;
    } else if (result === true as any) {
      await this._appendOrder(session, finalName);
      await this.refreshProjectTree(session, finalName);
      return true;
    }
    return false;
  },

  async createFolder(sessionOrName: WorkspaceSession | string, name?: string): Promise<boolean> {
    let session: WorkspaceSession;
    let folderName: string;
    if (typeof sessionOrName === 'string') {
      session = getActiveSession();
      folderName = sessionOrName;
    } else {
      session = sessionOrName;
      folderName = name!;
    }

    const result = await session.createFolder(folderName);
    if (result && typeof result === 'object' && result.success) {
      await this._appendOrder(session, result.newPath || folderName);
      await this.refreshProjectTree(session);
      return true;
    } else if (result === true as any) {
      await this._appendOrder(session, folderName);
      await this.refreshProjectTree(session);
      return true;
    }
    return false;
  },

  async renameSection(sessionOrOldName: WorkspaceSession | string, oldNameOrNewName: string, newName?: string): Promise<boolean> {
    let session: WorkspaceSession;
    let oldName: string;
    let finalNewName: string;
    if (typeof sessionOrOldName === 'string') {
      session = getActiveSession();
      oldName = sessionOrOldName;
      finalNewName = oldNameOrNewName;
    } else {
      session = sessionOrOldName;
      oldName = oldNameOrNewName;
      finalNewName = newName!;
    }

    const { activeFile, sections } = state.current;
    const normalizedOldName = normalizeExplorerPath(oldName);
    const existingNode = sections.find(section => normalizeExplorerPath(section.path) === normalizedOldName);
    const isDir = existingNode?.isDir ?? false;

    let finalName = normalizeExplorerPath(finalNewName);
    if (!isDir && !finalName.toLowerCase().endsWith('.md')) {
      finalName += '.md';
    }

    const success = await session.renameSection(oldName, finalName);
    
    if (success) {
      const normalizedNewName = normalizeExplorerPath(finalName);
      const normalizedActiveFile = activeFile ? normalizeExplorerPath(activeFile) : null;
      let nextActiveFile = normalizedActiveFile;
      if (normalizedActiveFile === normalizedOldName) {
        nextActiveFile = normalizedNewName;
      } else if (normalizedActiveFile && isDescendantPath(normalizedOldName, normalizedActiveFile)) {
        nextActiveFile = replacePathPrefix(normalizedActiveFile, normalizedOldName, normalizedNewName);
      }
      await this.refreshProjectTree(session, nextActiveFile);
      return true;
    }
    return false;
  },

  async deleteSection(sessionOrName: WorkspaceSession | string, name?: string): Promise<boolean> {
    let session: WorkspaceSession;
    let fileName: string;
    if (typeof sessionOrName === 'string') {
      session = getActiveSession();
      fileName = sessionOrName;
    } else {
      session = sessionOrName;
      fileName = name!;
    }

    const { activeFile } = state.current;
    const success = await session.deleteSection(fileName);
    if (success) {
      const normalizedName = normalizeExplorerPath(fileName);
      const normalizedActiveFile = activeFile ? normalizeExplorerPath(activeFile) : null;
      let nextActiveFile = normalizedActiveFile;
      if (normalizedActiveFile === normalizedName || (normalizedActiveFile && isDescendantPath(normalizedName, normalizedActiveFile))) {
        nextActiveFile = null;
      }
      await this.refreshProjectTree(session, nextActiveFile);
      return true;
    }
    return false;
  },

  async _appendOrder(session: WorkspaceSession, name: string): Promise<void> {
    try {
      for (const pathEntry of getPathChain(name)) {
        await session.mutateSettings({ type: 'append-order', path: pathEntry });
      }
    } catch (e) {
      console.error('Failed to append order', e);
      throw e;
    }
  },

  async moveSection(
    sessionOrSource: WorkspaceSession | string,
    sourceOrTarget: string | null,
    targetOrPlacement?: string | null | SectionPlacement,
    placementArg?: SectionPlacement
  ): Promise<boolean> {
    let session: WorkspaceSession;
    let sourcePath: string;
    let targetPath: string | null;
    let placement: SectionPlacement;
    if (typeof sessionOrSource === 'string') {
      session = getActiveSession();
      sourcePath = sessionOrSource;
      targetPath = sourceOrTarget;
      placement = targetOrPlacement as SectionPlacement;
    } else {
      session = sessionOrSource;
      sourcePath = sourceOrTarget!;
      targetPath = targetOrPlacement as string | null;
      placement = placementArg!;
    }

    const { activeFile } = state.current;
    try {
      const normalizedSource = normalizeExplorerPath(sourcePath);
      const result = await session.moveSection(normalizedSource, targetPath, placement);
      if (!result.success || !result.newPath) return false;

      const normalizedActiveFile = activeFile ? normalizeExplorerPath(activeFile) : null;
      let nextActiveFile = normalizedActiveFile;
      if (normalizedActiveFile === normalizedSource || (normalizedActiveFile && isDescendantPath(normalizedSource, normalizedActiveFile))) {
        nextActiveFile = replacePathPrefix(normalizedActiveFile, normalizedSource, result.newPath);
      }
      await this.refreshProjectTree(session, nextActiveFile);
      return true;
    } catch(err) {
      console.error('Failed to move section', err);
      return false;
    }
  },

  async togglePageBreak(sessionOrPath: WorkspaceSession | string, path?: string): Promise<boolean> {
    const session = typeof sessionOrPath === 'string' ? getActiveSession() : sessionOrPath;
    const finalPath = typeof sessionOrPath === 'string' ? sessionOrPath : path!;
    return this._setPathFlag(session, 'pageBreaks', finalPath);
  },

  async toggleHeaderVisibility(sessionOrPath: WorkspaceSession | string, pathOrHide: string | boolean, hide?: boolean): Promise<boolean> {
    const session = typeof sessionOrPath === 'string' ? getActiveSession() : sessionOrPath;
    const finalPath = typeof sessionOrPath === 'string' ? sessionOrPath : pathOrHide as string;
    const finalHide = typeof sessionOrPath === 'string' ? pathOrHide as boolean : hide!;
    return this._setPathFlag(session, 'hiddenHeaders', finalPath, finalHide);
  },

  async toggleFooterVisibility(sessionOrPath: WorkspaceSession | string, pathOrHide: string | boolean, hide?: boolean): Promise<boolean> {
    const session = typeof sessionOrPath === 'string' ? getActiveSession() : sessionOrPath;
    const finalPath = typeof sessionOrPath === 'string' ? sessionOrPath : pathOrHide as string;
    const finalHide = typeof sessionOrPath === 'string' ? pathOrHide as boolean : hide!;
    return this._setPathFlag(session, 'hiddenFooters', finalPath, finalHide);
  },

  async toggleHeadingNumbering(sessionOrPath: WorkspaceSession | string, pathOrEnabled: string | boolean, enabled?: boolean): Promise<boolean> {
    const session = typeof sessionOrPath === 'string' ? getActiveSession() : sessionOrPath;
    const finalPath = typeof sessionOrPath === 'string' ? sessionOrPath : pathOrEnabled as string;
    const finalEnabled = typeof sessionOrPath === 'string' ? pathOrEnabled as boolean : enabled!;
    return this._setPathFlag(session, 'numberedHeadings', finalPath, finalEnabled);
  },

  async toggleToc(sessionOrPath: WorkspaceSession | string, pathOrEnabled: string | boolean, enabled?: boolean): Promise<boolean> {
    const session = typeof sessionOrPath === 'string' ? getActiveSession() : sessionOrPath;
    const finalPath = typeof sessionOrPath === 'string' ? sessionOrPath : pathOrEnabled as string;
    const finalEnabled = typeof sessionOrPath === 'string' ? pathOrEnabled as boolean : enabled!;
    return this._setPathFlag(session, 'tocSections', finalPath, finalEnabled);
  },

  async checkProjectHealth(session?: WorkspaceSession): Promise<ProjectHealthReport> {
    const activeSession = getActiveSession(session);
    return activeSession.inspectProject();
  },

  async recoverProjectSettings(session?: WorkspaceSession): Promise<boolean> {
    const activeSession = getActiveSession(session);
    const report = await activeSession.recoverProjectSettings();
    return !report.issues.some(issue => issue.code === 'settings-invalid' || issue.code === 'settings-missing');
  },

  async _setPathFlag(session: WorkspaceSession, settingKey: PathFlagKey, path: string, enabled?: boolean): Promise<boolean> {
    try {
      const normalizedPath = normalizeExplorerPath(path);
      await session.mutateSettings({
        type: 'set-path-flag',
        key: settingKey,
        path: normalizedPath,
        enabled
      });
      const flagProperty: Record<PathFlagKey, 'pageBreak' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'> = {
        pageBreaks: 'pageBreak',
        hiddenHeaders: 'hideHeader',
        hiddenFooters: 'hideFooter',
        numberedHeadings: 'numberHeadings',
        tocSections: 'includeInToc'
      };
      const property = flagProperty[settingKey];
      const currentNode = state.current.sections.find(section => section.path === normalizedPath);
      const nextEnabled = enabled ?? !Boolean(currentNode?.[property]);
      state.setProjectTree(
        state.current.sections.map(section => section.path === normalizedPath
          ? { ...section, [property]: nextEnabled }
          : { ...section }),
        state.current.images.map(image => ({ ...image }))
      );
      return true;
    } catch (error) {
      console.error(`[ProjectService] Failed to update ${settingKey}:`, error);
      return false;
    }
  },

  async uploadImage(session: WorkspaceSession, filename: string, data: Uint8Array): Promise<boolean> {
    try {
      const existingImages = await session.listImages();
      let finalName = filename;
      const match = filename.match(/^(.*?)(\.[^.]+)?$/);
      const base = match ? match[1] : filename;
      const ext = match && match[2] ? match[2] : '';
      
      let counter = 1;
      while (existingImages.some(img => img.path === finalName)) {
        finalName = `${base}-${counter}${ext}`;
        counter++;
      }

      const success = await session.writeImage(finalName, data);
      if (success) {
        await this.refreshProjectTree(session);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ProjectService] Failed to upload image:', error);
      return false;
    }
  }
};

function getActiveSession(session?: WorkspaceSession): WorkspaceSession {
  if (session) return session;
  if (activeWorkspaceSession) return activeWorkspaceSession;
  throw new Error('No active workspace session is available.');
}

async function readProjectSnapshot(session: WorkspaceSession) {
  const [rawSections, rawImages, settings] = await Promise.all([
    session.listSections(),
    session.listImages(),
    session.readSettings()
  ]);
  let sections = rawSections
    .map(file => ({ ...file, path: normalizeExplorerPath(file.path) }))
    .filter(file => file.isDir || /\.(?:md|markdown)$/i.test(file.path));
  sections = sortSectionsByHierarchy(sections, settings.order).map(section => ({
    ...section,
    pageBreak: settings.pageBreaks.includes(section.path),
    hideHeader: settings.hiddenHeaders.includes(section.path),
    hideFooter: settings.hiddenFooters.includes(section.path),
    numberHeadings: settings.numberedHeadings.includes(section.path),
    includeInToc: settings.tocSections.includes(section.path)
  }));
  return {
    sections,
    images: rawImages.map(file => ({ ...file, path: normalizeExplorerPath(file.path) })),
    settings
  };
}
