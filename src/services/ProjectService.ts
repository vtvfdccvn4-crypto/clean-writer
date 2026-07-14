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

export const ProjectService = {
  async loadProjectSnapshot(session: WorkspaceSession): Promise<void> {
    const readId = ++latestProjectRead;
    const projectRef = state.current.projectRef;
    if (!projectRef) return;

    // ARCHITECTURE QA NOTE: this coarse timing is meant for trend comparisons
    // across snapshot-flow changes, not for sub-millisecond profiling.
    const started = performance.now();
    let loaded = false;
    try {
      const { sections, images, settings } = await readProjectSnapshot(session);
      if (readId !== latestProjectRead || state.current.projectRef !== projectRef) return;
      state.commitProjectSnapshot({
        projectRef,
        sections,
        images,
        pageSetup: settings.pageSetup,
        typographySetup: settings.typographySetup,
        listSetup: settings.listSetup,
        tableSetup: settings.tableSetup,
        imageSetup: settings.imageSetup,
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

  async refreshProjectTree(session: WorkspaceSession, activeFile: string | null = state.current.activeFile): Promise<void> {
    const readId = ++latestProjectRead;
    const projectRef = state.current.projectRef;
    if (!projectRef) {
      state.setProjectTree([], []);
      return;
    }

    // Keep tree-refresh timing separate from full snapshot loads so we can
    // distinguish list-only churn from actual project reload work.
    const started = performance.now();
    try {
      const { sections, images } = await readProjectSnapshot(session);
      if (readId !== latestProjectRead || state.current.projectRef !== projectRef) return;
      state.setProjectTree(sections, images, activeFile);
    } catch (e) {
      if (readId !== latestProjectRead || state.current.projectRef !== projectRef) return;
      console.error('Failed to refresh project tree', e);
      throw e;
    } finally {
      previewMetrics.recordProjectTreeRefresh(performance.now() - started);
    }
  },

  async createSection(session: WorkspaceSession, name: string, content?: string): Promise<boolean> {
    let finalName = name;

    if (!finalName.toLowerCase().endsWith('.md')) finalName += '.md';

    const result = await session.createSection(
      finalName, 
      content ?? '# ' + finalName.replace(/\.md$/i, '') + '\n\nStart writing here...'
    );

    if (result.success) {
      await this._appendOrder(session, result.newPath || finalName);
      await this.refreshProjectTree(session, result.newPath || finalName);
      return true;
    }
    return false;
  },

  async createFolder(session: WorkspaceSession, folderName: string): Promise<boolean> {

    const result = await session.createFolder(folderName);
    if (result.success) {
      await this._appendOrder(session, result.newPath || folderName);
      await this.refreshProjectTree(session);
      return true;
    }
    return false;
  },

  async renameSection(session: WorkspaceSession, oldName: string, finalNewName: string): Promise<boolean> {

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

  async deleteSection(session: WorkspaceSession, fileName: string): Promise<boolean> {

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

  async moveSection(session: WorkspaceSession, sourcePath: string, targetPath: string | null, placement: SectionPlacement): Promise<boolean> {

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

  async togglePageBreak(session: WorkspaceSession, path: string): Promise<boolean> {
    return this._setPathFlag(session, 'pageBreaks', path);
  },

  async toggleHeaderVisibility(session: WorkspaceSession, path: string, hide: boolean): Promise<boolean> {
    return this._setPathFlag(session, 'hiddenHeaders', path, hide);
  },

  async toggleFooterVisibility(session: WorkspaceSession, path: string, hide: boolean): Promise<boolean> {
    return this._setPathFlag(session, 'hiddenFooters', path, hide);
  },

  async toggleHeadingNumbering(session: WorkspaceSession, path: string, enabled: boolean): Promise<boolean> {
    return this._setPathFlag(session, 'numberedHeadings', path, enabled);
  },

  async toggleToc(session: WorkspaceSession, path: string, enabled: boolean): Promise<boolean> {
    return this._setPathFlag(session, 'tocSections', path, enabled);
  },

  async checkProjectHealth(session: WorkspaceSession): Promise<ProjectHealthReport> {
    return session.inspectProject();
  },

  async recoverProjectSettings(session: WorkspaceSession): Promise<boolean> {
    const report = await session.recoverProjectSettings();
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
    return Boolean(await this.uploadImageWithPath(session, filename, data));
  },

  /** Store an image and return its collision-safe, portable project path. */
  async uploadImageWithPath(
    session: WorkspaceSession,
    filename: string,
    data: Uint8Array,
    options: { refreshTree?: boolean } = {}
  ): Promise<string | null> {
    try {
      const existingImages = await session.listImages();
      let finalName = filename;
      const match = filename.match(/^(.*?)(\.[^.]+)?$/);
      const base = match ? match[1] : filename;
      const ext = match && match[2] ? match[2] : '';
      
      let counter = 1;
      while (existingImages.some(img => img.path === finalName || img.path === `images/${finalName}`)) {
        finalName = `${base}-${counter}${ext}`;
        counter++;
      }

      const success = await session.writeImage(finalName, data);
      if (success) {
        if (options.refreshTree !== false) await this.refreshProjectTree(session);
        return finalName.startsWith('images/') ? finalName : `images/${finalName}`;
      }
      return null;
    } catch (error) {
      console.error('[ProjectService] Failed to upload image:', error);
      return null;
    }
  }
};

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
