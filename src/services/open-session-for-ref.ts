import type { WorkspaceRef, WorkspaceRepository, WorkspaceSession } from '../platform/types';
import { projectSession } from './ProjectSessionStore';

/**
 * The session for a project that is already open. A document opened from the computer has no entry in the
 * workspace repository, so reopening it there fails. For those, the session that is open is the one to use.
 * Every other project is reopened from the repository, as before.
 */
export async function openSessionForRef(ref: WorkspaceRef, repository: Pick<WorkspaceRepository, 'open'>): Promise<WorkspaceSession> {
  const active = projectSession.getSession();
  if (ref.kind === 'file' && active && active.id === ref.id) return active;
  return repository.open(ref);
}
