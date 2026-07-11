import type { ProjectHealthReport } from '../types';

type WorkspaceAction = 'open' | 'save' | 'settings' | 'close' | 'project';

export function summarizeProjectHealth(report: ProjectHealthReport): string {
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

export function buildRecoverySuccessMessage(report: ProjectHealthReport): string {
  const backup = report.backupPath
    ? ` A backup was saved as ${report.backupPath}.`
    : '';
  return `Project settings were recovered successfully.${backup}`;
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
    return 'A required project file is missing. Check the folder contents and try again.';
  }

  if (action === 'settings') {
    return 'Settings could not be saved. The last saved values are still in place. Check the project location and try again.';
  }
  if (action === 'close') {
    return 'Clear Writer could not save the current section before closing, so the window will remain open. Retry Save or choose another project location.';
  }
  if (action === 'save') {
    return 'The current section could not be saved. Keep this window open, check the project location, and try again.';
  }
  if (action === 'project') {
    return 'The project could not be updated. Check the project location and try again.';
  }
  return 'The project could not be opened. Check the folder connection and try again.';
}
