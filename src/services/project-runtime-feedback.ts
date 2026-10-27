import type { ProjectHealthReport } from '../types';

type WorkspaceAction = 'open' | 'save' | 'settings' | 'close' | 'project';

function summarizeProjectHealth(report: ProjectHealthReport): string {
  if (!report.issues.length) return 'No issues detected.';
  return report.issues
    .map(issue => issue.message.trim())
    .filter(Boolean)
    .join(' ');
}

export function buildRecoveryPromptMessage(report: ProjectHealthReport): string {
  const summary = summarizeProjectHealth(report);
  return `${summary} Clear Writer can rebuild a fresh settings file and keep a backup of the current one when possible.`;
}

export function buildProjectHealthFailureMessage(report: ProjectHealthReport): string {
  const summary = summarizeProjectHealth(report);
  return `This folder could not be opened as a Clear Writer project. ${summary}`;
}

export function describeWorkspaceError(error: unknown, action: WorkspaceAction): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  const normalized = text.toLowerCase();

  if (normalized.includes('permission') || normalized.includes('notallowederror') || normalized.includes('securityerror')) {
    if (action === 'open') {
      return 'Permission to this local folder is no longer available. Click Open and choose the folder again to reconnect it.';
    }
    if (action === 'settings') {
      return 'Settings could not be saved because access to the current folder was lost. Reconnect the folder and try again.';
    }
    if (action === 'close') {
      return 'The current section could not be saved before closing because access to the current folder was lost. Reconnect the folder and try again.';
    }
    if (action === 'project') {
      return 'The project could not be updated because access to the current folder was lost. Reconnect the folder and try again.';
    }
    return 'The current section could not be saved because access to the current folder was lost. Reconnect the folder and try again.';
  }

  // Browser storage is limited, and running out of it is the most likely reason a browser-managed project cannot save.
  if (normalized.includes('quota') || normalized.includes('no space') || normalized.includes('disk full')) {
    if (action === 'open') {
      return 'The project could not be opened because browser storage is full. Free space in this browser and try again.';
    }
    return 'Browser storage is full, so the change could not be saved. Your text is still open. Delete unused images or sections to free space, then keep editing to save again.';
  }

  if (normalized.includes('no stored handle')) {
    return 'This local folder is no longer available from the recent-project list. Use Open to choose it again.';
  }

  if (normalized.includes('local folder access is unavailable')) {
    return 'This browser cannot access local folder projects. Open the project in a supported browser and choose the folder again to reconnect it.';
  }

  if (normalized.includes('file not found')) {
    if (action === 'open') {
      return 'The selected project is missing one or more required files. Check the folder contents and try again.';
    }
    return 'A required project file is missing. Close the project and open it again.';
  }

  if (action === 'settings') {
    return 'Settings could not be saved. The last saved values are still in place. Try again.';
  }
  if (action === 'close') {
    return 'Clear Writer could not save the current section before closing, so the project stays open. Try again.';
  }
  if (action === 'save') {
    return 'The current section could not be saved. Your text is still open: keep this tab open and keep editing to try again. If it keeps failing, copy your text somewhere safe.';
  }
  if (action === 'project') {
    return 'The project could not be updated. Try again.';
  }
  return 'The project could not be opened. Try again.';
}
