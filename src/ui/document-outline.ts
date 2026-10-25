import { state } from '../state';
import type { EditorManager } from './editor-manager';
import type { Platform, WorkspaceSession } from '../platform/types';
import { extractMarkdownHeadings, type MarkdownHeading } from '../editor/markdown-headings';
import { extractWritingStatistics, calculateReadingTime } from '../editor/writing-statistics';
import { outlineSectionHtml, createOutlineView, type OutlineSectionChunk } from './outline-view';
import { normalizeExplorerPath } from '../utils/path-utils';
import { OUTLINE_ACTIVATED_EVENT, PROJECT_STATS_REFRESH_EVENT, type ProjectStatsRefreshDetail } from './outline-events';

interface SectionOutline {
  headings: MarkdownHeading[];
  words: number;
}

export function initDocumentOutlineDrawer(platform: Platform, editorManager: EditorManager) {
  const drawer = document.querySelector<HTMLElement>('#task-panel .outline-section');
  const content = document.getElementById('document-outline-content');
  const emptyState = document.getElementById('document-outline-empty');
  const footer = document.querySelector<HTMLElement>('#task-panel .task-footer');

  if (!drawer || !content || !emptyState) {
    return;
  }
  const outlineDrawer = drawer;
  let outlineDirty = true;
  const outlineView = createOutlineView(content, activation => {
    if (activation.action === 'section') void navigateToSection(activation.path);
    else void navigateToHeading(activation.path, activation.line);
  });
  let rebuildInFlight: Promise<void> | null = null;
  // Parsed outline per section, so a save only re-reads the section it wrote.
  const sectionCache = new Map<string, SectionOutline>();
  // Bumped on invalidation so a read that started before it is not cached.
  const sectionVersions = new Map<string, number>();
  let cacheEpoch = 0;

  const invalidateSection = (path: string) => {
    const key = normalizeExplorerPath(path);
    sectionCache.delete(key);
    sectionVersions.set(key, (sectionVersions.get(key) ?? 0) + 1);
  };

  const invalidateAllSections = () => {
    sectionCache.clear();
    cacheEpoch += 1;
  };

  const showFooter = () => {
    footer?.classList.remove('hidden');
    if (footer) footer.setAttribute('aria-hidden', 'false');
  };

  const hideFooter = () => {
    footer?.classList.add('hidden');
    if (footer) footer.setAttribute('aria-hidden', 'true');
  };

  document.addEventListener(OUTLINE_ACTIVATED_EVENT, () => {
    showFooter();
    outlineDirty = true;
    void rebuildOutline();
  });

  state.onProjectSnapshotChanged(() => {
    invalidateAllSections();
    if (!drawer.hidden) {
      outlineDirty = true;
      void rebuildOutline();
    }
  });

  state.onProjectTreeChanged(() => {
    invalidateAllSections();
    if (!drawer.hidden) {
      outlineDirty = true;
      void rebuildOutline();
    }
  });

  // Settings changes can rewrite section files (e.g. the image presentation reset).
  state.onSettingsSnapshotChanged(() => {
    invalidateAllSections();
  });

  window.addEventListener(PROJECT_STATS_REFRESH_EVENT, event => {
    const path = (event as CustomEvent<ProjectStatsRefreshDetail | undefined>).detail?.path;
    if (path) invalidateSection(path);
    else invalidateAllSections();
    if (!drawer.hidden) {
      outlineDirty = true;
      void rebuildOutline();
    }
  });

  state.onProjectChanged(() => {
    invalidateAllSections();
    outlineDirty = true;
    if (!state.current.projectRef) {
      hideFooter();
      clearOutline();
    } else if (!drawer.hidden) {
      showFooter();
      clearOutline();
    }
  });

  async function rebuildOutline() {
    if (rebuildInFlight) return rebuildInFlight;
    rebuildInFlight = (async () => {
      do {
        outlineDirty = false;
        await rebuildOutlineImpl();
      } while (outlineDirty && !outlineDrawer.hidden);
    })();
    try {
      await rebuildInFlight;
    } finally {
      rebuildInFlight = null;
    }
    return undefined;
  }

  async function rebuildOutlineImpl() {
    const { projectRef, sections } = state.current;
    if (!projectRef || !sections || !content || !emptyState) {
      clearOutline();
      return;
    }

    try {
      let session: WorkspaceSession | null = null;
      const summaryStats = document.getElementById('project-statistics-summary');
      let totalHeadings = 0;
      let totalWords = 0;
      const sectionChunks: OutlineSectionChunk[] = [];
      const livePaths = new Set<string>();

      for (const section of sections) {
        if (section.isDir) continue;
        const key = normalizeExplorerPath(section.path);
        livePaths.add(key);
        let outline = sectionCache.get(key);
        if (!outline) {
          const version = sectionVersions.get(key) ?? 0;
          const epoch = cacheEpoch;
          session ??= await platform.workspaceRepository.open(projectRef);
          const text = await session.readSection(section.path);
          outline = { headings: extractMarkdownHeadings(text), words: extractWritingStatistics(text).words };
          if (epoch === cacheEpoch && (sectionVersions.get(key) ?? 0) === version) sectionCache.set(key, outline);
        }
        const { headings } = outline;

        totalWords += outline.words;

        if (headings.length > 0) {
          totalHeadings += headings.length;
        }

        const sectionName = section.path.split('/').pop() || section.path;

        sectionChunks.push({ key: `section:${key}`, html: outlineSectionHtml(section.path, sectionName, headings) });
      }

      for (const key of sectionCache.keys()) {
        if (!livePaths.has(key)) sectionCache.delete(key);
      }

      outlineView.render(sectionChunks);
      
      if (summaryStats) {
        if (totalWords > 0 || totalHeadings > 0) {
          const readingTime = calculateReadingTime(totalWords);
          summaryStats.textContent = `Project Totals: ${totalWords.toLocaleString()} words • ~${readingTime}m read`;
          showFooter();
        } else {
          summaryStats.textContent = '';
          hideFooter();
        }
      }

      if (totalHeadings === 0) {
        content.classList.add('hidden');
        emptyState.classList.remove('hidden');
      } else {
        content.classList.remove('hidden');
        emptyState.classList.add('hidden');
      }

    } catch (e) {
      console.error('Failed to rebuild outline', e);
      clearOutline();
      outlineDirty = true;
    }
  }

  function clearOutline() {
    if (!content || !emptyState) return;
    outlineView.clear();
    content.classList.add('hidden');
    emptyState.classList.remove('hidden');
    const summaryStats = document.getElementById('project-statistics-summary');
    if (summaryStats) {
      summaryStats.textContent = '';
    }
  }

  async function navigateToSection(path: string) {
    if (!await editorManager.prepareForNavigation()) return;
    await editorManager.openDocument(path);
  }

  async function navigateToHeading(path: string, line: number) {
    if (!await editorManager.prepareForNavigation()) return;
    await editorManager.navigateToLine(path, line);
  }
}
