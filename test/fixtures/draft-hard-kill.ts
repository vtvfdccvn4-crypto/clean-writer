import { createBrowserDraftStore, hashDraftText } from '../../src/editor/DraftStore';

// Used by scripts/draft-hard-kill-test.mjs. The write page saves numbered drafts one after another
// and reports each acknowledged version. The driver kills the browser process and reopens the same
// profile; the read page reports what survived.

declare global {
  interface Window {
    __acked?: number;
    __writeFailed?: boolean;
    __pauseRequested?: boolean;
    __paused?: boolean;
    __readResult?: { found: boolean; intact: boolean; version: number; health: string };
  }
}

const target = { projectId: 'kill-project', path: 'sections/kill.md' };
const padding = 'x'.repeat(20_000);
const store = createBrowserDraftStore();
const mode = new URLSearchParams(location.search).get('mode');

if (mode === 'write') {
  const baseHash = await hashDraftText('file on disk');
  window.__acked = 0;
  for (let version = 1; ; version += 1) {
    if (window.__pauseRequested) {
      window.__paused = true;
      break;
    }
    if (!(await store.write(target, `Draft version ${version}\n${padding}`, baseHash))) {
      window.__writeFailed = true;
      break;
    }
    window.__acked = version;
  }
} else {
  const lookup = await store.read(target);
  const match = /^Draft version (\d+)/.exec(lookup?.record.content ?? '');
  window.__readResult = {
    found: lookup !== null,
    intact: lookup?.intact ?? false,
    version: match ? Number(match[1]) : 0,
    health: store.health
  };
}
