/** Fired on `document` when the task panel switches to the outline view. */
export const OUTLINE_ACTIVATED_EVENT = 'clear-writer-task-outline-activated';

/** Fired on `window` after a section is persisted. `detail.path` names the saved section. */
export const PROJECT_STATS_REFRESH_EVENT = 'clear-writer-project-stats-refresh';

export interface ProjectStatsRefreshDetail {
  path: string;
}

export function dispatchSectionSaved(path: string): void {
  window.dispatchEvent(new CustomEvent<ProjectStatsRefreshDetail>(PROJECT_STATS_REFRESH_EVENT, { detail: { path } }));
}
