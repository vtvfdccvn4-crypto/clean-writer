import { state } from '../state';
import type { EditorManager } from './editor-manager';
import type { Platform } from '../platform/types';
import { extractMarkdownHeadings } from '../editor/markdown-headings';
import { extractWritingStatistics, calculateReadingTime } from '../editor/writing-statistics';
import { escapeHtml } from '../utils/escapeHtml';

export function initDocumentOutlineDrawer(platform: Platform, editorManager: EditorManager) {
  const PROJECT_STATS_REFRESH_EVENT = 'clear-writer-project-stats-refresh';
  const OUTLINE_ACTIVATED_EVENT = 'clear-writer-task-outline-activated';
  const drawer = document.querySelector<HTMLElement>('#task-panel .outline-section');
  const content = document.getElementById('document-outline-content');
  const emptyState = document.getElementById('document-outline-empty');
  const footer = document.querySelector<HTMLElement>('#task-panel .task-footer');

  if (!drawer || !content || !emptyState) {
    return;
  }
  const outlineDrawer = drawer;
  let outlineDirty = true;
  let rebuildInFlight: Promise<void> | null = null;

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
    if (!drawer.hidden) {
      outlineDirty = true;
      void rebuildOutline();
    }
  });

  state.onProjectTreeChanged(() => {
    if (!drawer.hidden) {
      outlineDirty = true;
      void rebuildOutline();
    }
  });

  window.addEventListener(PROJECT_STATS_REFRESH_EVENT, () => {
    if (!drawer.hidden) {
      outlineDirty = true;
      void rebuildOutline();
    }
  });

  state.onProjectChanged(() => {
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
      const session = await platform.workspaceRepository.open(projectRef);
      const summaryStats = document.getElementById('project-statistics-summary');
      let totalHeadings = 0;
      let totalWords = 0;
      const htmlChunks: string[] = [];

      for (const section of sections) {
        if (section.isDir) continue;
        const text = await session.readSection(section.path);
        const headings = extractMarkdownHeadings(text);
        const stats = extractWritingStatistics(text);
        
        totalWords += stats.words;

        if (headings.length > 0) {
          totalHeadings += headings.length;
        }

        const sectionName = section.path.split('/').pop() || section.path;

        let sectionHtml = `<div class="document-outline-section">`;
        sectionHtml += `
          <div class="document-outline-section-name" data-path="${escapeHtml(section.path)}">
            ${escapeHtml(sectionName)}
          </div>
        `;

        for (const heading of headings) {
          const indent = (heading.level - 1) * 12 + 12;
          sectionHtml += `
            <div class="document-outline-heading" data-path="${escapeHtml(section.path)}" data-line="${heading.line}" style="padding-left: ${indent}px">
              ${escapeHtml(heading.text || '(empty heading)')}
            </div>
          `;
        }

        sectionHtml += `</div>`;
        htmlChunks.push(sectionHtml);
      }

      content.innerHTML = htmlChunks.join('');
      
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

      content.querySelectorAll('.document-outline-section-name').forEach(el => {
        el.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLElement;
          const path = target.dataset.path;
          if (path) {
            await navigateToSection(path);
          }
        });
      });

      content.querySelectorAll('.document-outline-heading').forEach(el => {
        el.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLElement;
          const path = target.dataset.path;
          const line = target.dataset.line ? parseInt(target.dataset.line, 10) : 1;
          if (path) {
            await navigateToHeading(path, line);
          }
        });
      });
      
    } catch (e) {
      console.error('Failed to rebuild outline', e);
      clearOutline();
      outlineDirty = true;
    }
  }

  function clearOutline() {
    if (!content || !emptyState) return;
    content.innerHTML = '';
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
