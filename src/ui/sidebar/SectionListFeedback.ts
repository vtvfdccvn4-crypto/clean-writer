import { showNotice } from '../components/Notice';
import { describeWorkspaceError } from '../../services/project-runtime-feedback';

export function showProjectUpdateError(operation: string, error: unknown): void {
  console.error(`[SectionList] Failed to ${operation}:`, error);
  showNotice(describeWorkspaceError(error, 'project'), 'error');
}
