import { state, APP_STATE_EVENTS } from '../state';
import type { Platform } from '../platform/types';
import type { EditorManager } from './editor-manager';
import { closeDrawer, toggleDrawer } from './drawer-manager';
import { reviewProject, type ProjectReviewResult } from '../services/project-review';

export function initProjectReviewDrawer(platform: Platform, editorManager: EditorManager) {
  const button = document.getElementById('btn-open-project-review');
  const drawer = document.getElementById('project-review-drawer');
  const status = document.getElementById('project-review-status') as HTMLElement | null;
  const results = document.getElementById('project-review-results') as HTMLElement | null;
  const empty = document.getElementById('project-review-empty') as HTMLElement | null;
  const refresh = document.getElementById('project-review-refresh') as HTMLButtonElement | null;
  if (!button || !drawer || !status || !results || !empty || !refresh) return;
  const reviewStatus = status;
  const reviewResults = results;
  const reviewEmpty = empty;
  const refreshButton = refresh;

  let runId = 0;
  button.addEventListener('click', () => {
    const opening = drawer.classList.contains('hidden');
    toggleDrawer(drawer);
    if (opening) void runReview();
  });
  drawer.querySelector('.drawer-close-button')?.addEventListener('click', () => closeDrawer(drawer));
  refresh.addEventListener('click', () => void runReview());
  state.on(APP_STATE_EVENTS.projectSnapshotChanged, () => { if (!drawer.classList.contains('hidden')) void runReview(); });
  state.on(APP_STATE_EVENTS.projectTreeChanged, () => { if (!drawer.classList.contains('hidden')) void runReview(); });
  state.on(APP_STATE_EVENTS.projectChanged, () => { if (!state.current.projectRef) clear(); });

  async function runReview() {
    const currentRun = ++runId;
    const { projectRef, sections } = state.current;
    if (!projectRef || !sections) { clear(); return; }
    reviewStatus.textContent = 'Reviewing...';
    refreshButton.disabled = true;
    reviewResults.innerHTML = '';
    reviewEmpty.classList.add('hidden');
    try {
      const session = await platform.workspaceRepository.open(projectRef);
      const findings = await reviewProject(session, sections);
      if (currentRun !== runId) return;
      render(findings);
    } catch (error) {
      if (currentRun !== runId) return;
      console.error('Project review failed:', error);
      reviewStatus.textContent = 'Review failed. Try again.';
      reviewEmpty.classList.add('hidden');
    } finally {
      if (currentRun === runId) refreshButton.disabled = false;
    }
  }

  function render(findings: ProjectReviewResult[]) {
    reviewResults.innerHTML = '';
    reviewStatus.textContent = findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'}` : 'Review complete';
    reviewEmpty.classList.toggle('hidden', findings.length > 0);
    findings.forEach(finding => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'project-review-result';
      const heading = document.createElement('strong');
      heading.textContent = finding.title;
      const location = document.createElement('span');
      location.textContent = `${finding.path} · line ${finding.line}`;
      const detail = document.createElement('span');
      detail.textContent = finding.detail;
      item.append(heading, location, detail);
      item.addEventListener('click', () => void navigate(finding));
      reviewResults.appendChild(item);
    });
  }

  async function navigate(finding: ProjectReviewResult) {
    if (!await editorManager.prepareForNavigation()) return;
    state.setActiveFile(finding.path);
    requestAnimationFrame(() => editorManager.focusLine(finding.line));
  }

  function clear() {
    reviewResults.innerHTML = '';
    reviewStatus.textContent = '';
    reviewEmpty.classList.add('hidden');
  }
}
