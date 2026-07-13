import { state } from '../state';
import { closeDrawer, toggleDrawer } from './drawer-manager';
import type { EditorManager } from './editor-manager';
import type { Platform } from '../platform/types';
import { extractMarkdownHeadings } from '../editor/markdown-headings';
import { extractWritingStatistics, calculateReadingTime } from '../editor/writing-statistics';

export function initDocumentOutlineDrawer(platform: Platform, editorManager: EditorManager) {
  const PROJECT_STATS_REFRESH_EVENT = 'clear-writer-project-stats-refresh';
  const btnOutline = document.getElementById('btn-open-document-outline');
  const drawer = document.getElementById('document-outline-drawer');
  const content = document.getElementById('document-outline-content');
  const emptyState = document.getElementById('document-outline-empty');

  if (!btnOutline || !drawer || !content || !emptyState) {
    return;
  }
  btnOutline.addEventListener('click', () => {
    const isOpening = drawer.classList.contains('hidden');
    if (isOpening) {
      void rebuildOutline();
    }
    toggleDrawer(drawer);
  });

  const closeBtn = drawer.querySelector('.drawer-close-button');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeDrawer(drawer);
    });
  }

  state.onProjectSnapshotChanged(() => {
    if (!drawer.classList.contains('hidden')) {
      void rebuildOutline();
    }
  });

  state.onProjectTreeChanged(() => {
    if (!drawer.classList.contains('hidden')) {
      void rebuildOutline();
    }
  });

  window.addEventListener(PROJECT_STATS_REFRESH_EVENT, () => {
    if (!drawer.classList.contains('hidden')) {
      void rebuildOutline();
    }
  });

  state.onProjectChanged(() => {
    if (!state.current.projectRef) {
      clearOutline();
    } else if (!drawer.classList.contains('hidden')) {
      clearOutline();
    }
  });

  async function rebuildOutline() {
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

        const escapeHtml = (unsafe: string) => unsafe
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

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
          summaryStats.classList.remove('hidden');
        } else {
          summaryStats.classList.add('hidden');
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
    }
  }

  function clearOutline() {
    if (!content || !emptyState) return;
    content.innerHTML = '';
    content.classList.add('hidden');
    emptyState.classList.remove('hidden');
    const summaryStats = document.getElementById('project-statistics-summary');
    if (summaryStats) {
      summaryStats.classList.add('hidden');
      summaryStats.textContent = '';
    }
  }

  async function navigateToSection(path: string) {
    if (!await editorManager.prepareForNavigation()) return;
    state.setActiveFile(path);
  }

  async function navigateToHeading(path: string, line: number) {
    await navigateToSection(path);
    requestAnimationFrame(() => {
      editorManager.focusLine(line);
    });
  }
}
