import { createBrowserDraftStore, hashDraftText, type DraftRecord } from '../../src/editor/DraftStore';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const PHASE_KEY = 'draft-store-smoke-phase';
const DRAFT_DB = 'clear-writer-drafts';
const target = { projectId: 'smoke-project', path: 'sections/durable.md' };
const durableText = 'DURABLE_DRAFT_TEXT é 1000 words of recovery';

/** Writes a record directly, bypassing the store, to simulate damage or a newer build. */
function putRawRecord(record: DraftRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_DB, 1);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(record);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function run(): Promise<void> {
  const store = createBrowserDraftStore();

  // Phase one writes the draft, then reloads the page. The draft must still be
  // there after the reload, so phase two verifies it from a fresh page.
  if (sessionStorage.getItem(PHASE_KEY) === null) {
    sessionStorage.setItem(PHASE_KEY, 'after-reload');
    // No result is published before the reload: the runner would read it while the page is still loading.
    await store.write(target, durableText, await hashDraftText('file on disk'));
    location.reload();
    return;
  }

  const afterReload = await store.read(target);
  const survivedReload = afterReload !== null && afterReload.intact && afterReload.record.content === durableText;
  const healthAfterRead = store.health;

  // A damaged record is reported, not restored.
  await putRawRecord({ ...afterReload!.record, content: 'tampered' });
  const damaged = await store.read(target);
  const damageDetected = damaged !== null && damaged.intact === false;

  // A record from a newer build is not returned and not deleted.
  await putRawRecord({ ...afterReload!.record, content: durableText, schema: 99 });
  const newerIgnored = await store.read(target) === null;

  // A save that matches the stored text removes the draft.
  await putRawRecord({ ...afterReload!.record, schema: 1 });
  await store.discardIfSaved(target, durableText);
  const discarded = await store.read(target) === null;

  sessionStorage.removeItem(PHASE_KEY);
  window.__HARNESS_RESULT__ = {
    ok: survivedReload && damageDetected && newerIgnored && discarded && healthAfterRead === 'ok',
    survivedReload,
    damageDetected,
    newerIgnored,
    discarded,
    healthAfterRead,
    healthAtEnd: store.health
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
