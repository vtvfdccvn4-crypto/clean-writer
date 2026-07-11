import { OPFSCatalogue, OPFSWorkspaceRepository } from '/src/platform';
import { state } from '/src/state.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

async function waitFor<T>(label: string, read: () => T | null | undefined | false, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for restore smoke condition: ${label}`);
}

async function run() {
  if (new URLSearchParams(window.location.search).get('restoreLastWorkspace') !== 'true') {
    const url = new URL(window.location.href);
    url.searchParams.set('restoreLastWorkspace', 'true');
    window.location.replace(url.toString());
    return;
  }

  const catalogue = new OPFSCatalogue();
  await catalogue.open();

  const ref = {
    id: `opfs-restore-${Date.now().toString(36)}`,
    kind: 'opfs' as const,
    displayName: 'Restore Smoke'
  };

  await catalogue.register(ref);
  const repository = new OPFSWorkspaceRepository(catalogue);
  const session = await repository.open(ref);
  await session.createSection('restored.md', '# Restored\nFrom last-opened boot');
  await session.mutateSettings({ type: 'append-order', path: 'restored.md' });

  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null);

  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await waitFor('restored project ref', () => state.current.projectRef?.id === ref.id ? state.current.projectRef : null);
  await waitFor('restored section tree', () => state.current.sections.some(section => section.path === 'sections/restored.md') ? true : null);

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind: state.current.projectRef?.kind ?? null,
    projectId: state.current.projectRef?.id ?? null,
    activeFile: state.current.activeFile,
    sectionPaths: state.current.sections.map(section => section.path),
    restoredRefId: ref.id
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
