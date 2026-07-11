const STORAGE_PREFIX = 'cw-draft:';
const SAVED_PREFIX = 'cw-draft-saved:';

interface StoredDraftRecord {
  content: string;
  updatedAt: number;
}

function draftKey(projectId: string, path: string): string {
  return `${STORAGE_PREFIX}${projectId}:${path}`;
}

function savedKey(projectId: string, path: string): string {
  return `${SAVED_PREFIX}${projectId}:${path}`;
}

export class DraftRecoveryStore {
  /**
   * Save a temporary draft of a document to local storage.
   */
  static saveDraft(projectId: string, path: string, content: string): void {
    try {
      const record: StoredDraftRecord = {
        content,
        updatedAt: Date.now()
      };
      localStorage.setItem(draftKey(projectId, path), JSON.stringify(record));
    } catch (e) {
      console.warn('Failed to save draft to localStorage', e);
    }
  }

  /**
   * Retrieve a draft of a document from local storage if it exists.
   */
  static getDraft(projectId: string, path: string): string | null {
    try {
      const rawDraft = localStorage.getItem(draftKey(projectId, path));
      if (rawDraft === null) return null;

      const lastSavedAt = DraftRecoveryStore.getLastSavedAt(projectId, path);

      try {
        const parsed = JSON.parse(rawDraft) as StoredDraftRecord;
        if (parsed && typeof parsed.content === 'string') {
          if (lastSavedAt !== null && typeof parsed.updatedAt === 'number' && parsed.updatedAt <= lastSavedAt) {
            return null;
          }
          return parsed.content;
        }
      } catch {
        // Legacy raw-string draft. Treat it as stale if a successful save marker exists.
      }

      return lastSavedAt === null ? rawDraft : null;
    } catch (e) {
      console.warn('Failed to read draft from localStorage', e);
      return null;
    }
  }

  /**
   * Remove a draft of a document from local storage.
   */
  static clearDraft(projectId: string, path: string): void {
    try {
      localStorage.removeItem(draftKey(projectId, path));
    } catch (e) {
      console.warn('Failed to remove draft from localStorage', e);
    }
  }

  static markSaved(projectId: string, path: string): void {
    try {
      localStorage.setItem(savedKey(projectId, path), String(Date.now()));
    } catch (e) {
      console.warn('Failed to save draft saved-marker to localStorage', e);
    }
  }

  static getLastSavedAt(projectId: string, path: string): number | null {
    try {
      const value = localStorage.getItem(savedKey(projectId, path));
      if (!value) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (e) {
      console.warn('Failed to read draft saved-marker from localStorage', e);
      return null;
    }
  }
}
