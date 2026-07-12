import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const serverPort = await reservePort();
const browserDebugPort = await reservePort();
const browserExecutable = await detectBrowserExecutable();
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-release-smoke-'));

const fixtures = [
  {
    name: 'step10-browser-smoke',
    path: '/test/fixtures/step10-browser-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Step 10 browser smoke reported failure.');
      expect(result.projectKind === 'opfs', `Expected Step 10 OPFS project, got ${result.projectKind}.`);
      expect(result.templateCount === 5, 'Step 10 template creation coverage was incomplete.');
      expect(result.toolbarEdited === true, 'Step 10 Markdown toolbar did not edit selected text.');
      expect(result.pdfPrintCalled === true, 'Step 10 PDF export did not invoke the browser PDF mechanism.');
      expect(typeof result.reviewCount === 'number' && result.reviewCount >= 4, 'Step 10 review drawer did not report expected structural findings.');
      expect(Array.isArray(result.reviewKinds) && result.reviewKinds.includes('Duplicate heading') && result.reviewKinds.includes('Empty section') && result.reviewKinds.includes('Very long section'), 'Step 10 review checks were incomplete.');
      expect(result.outlineShortcut === true && result.searchShortcut === true, 'Step 10 drawer shortcuts did not open their targets.');
    }
  },
  {
    name: 'release-browser-smoke',
    path: '/test/fixtures/release-browser-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Release browser smoke reported failure.');
      expect(result.projectKind === 'opfs', 'Release browser smoke did not create an OPFS project.');
      expect(result.workspaceChip === 'Browser storage', `Expected browser storage chip, got ${result.workspaceChip}.`);
      expect(result.exportButtonsDisabled === false, 'PDF export should be available while DOCX remains deferred.');
      expect(
        result.exportPdfLabel === 'Export PDF',
        'PDF export button did not expose the unified Export PDF action.'
      );
      expect(
        typeof result.exportDocxLabel === 'string' && result.exportDocxLabel.includes('Release 2'),
        'Word export button did not explain its Release 2 status.'
      );
      expect(result.manifestPresent === true, 'Release manifest was not linked in the web shell.');
    }
  },
  {
    name: 'browser-authoring-smoke',
    path: '/test/fixtures/browser-authoring-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser authoring smoke reported failure.');
      expect(result.projectKind === 'opfs', `Expected OPFS project kind, got ${result.projectKind}.`);
      expect(result.projectNameShown === 'Authoring Smoke', `Expected project name to show Authoring Smoke, got ${result.projectNameShown}.`);
      expect(result.workspaceChipShown === 'Browser storage', `Expected browser storage chip after create, got ${result.workspaceChipShown}.`);
      expect(result.projectNameAfterClose === 'No project open', `Expected closed project label, got ${result.projectNameAfterClose}.`);
      expect(result.workspaceChipHiddenAfterClose === true, 'Workspace chip should be hidden after closing the project.');
      expect(result.reopenedProjectName === 'Authoring Smoke', `Expected reopened project name to match, got ${result.reopenedProjectName}.`);
      expect(result.reopenedWorkspaceChip === 'Browser storage', `Expected reopened workspace chip to match, got ${result.reopenedWorkspaceChip}.`);
      expect(Array.isArray(result.alerts) && result.alerts.length === 0, 'Browser authoring smoke triggered unexpected alerts.');
      expect(result.savedViaShortcut === true, 'Keyboard save did not complete successfully.');
      expect(result.fullDocSaveNoticeSeen === true, 'Full-document save notice was not shown.');
      expect(result.viewStateRestored === true, 'Editor selection/view state was not restored.');
      expect(result.searchPanelOpened === true, 'Search panel did not open from the toolbar action.');
      expect(result.recoveryConfirmShown === true, 'Draft recovery confirmation was not shown.');
      expect(result.draftRestored === true, 'Draft recovery did not restore the draft content.');
      expect(result.fileDropNoticeSeen === true, 'Unsupported file drop notice was not shown.');
      expect(result.longTextSaved === true, 'Long-text save flow did not return to Saved state.');
      expect(result.longTextPreserved === true, 'Long-text content was not preserved after switching away and back.');
      expect(result.longTextCursorRestored === true, 'Long-text cursor position was not restored.');
      expect(result.pageSetupDraftDiscarded === true, 'Page setup draft values were not discarded on close.');
      expect(result.pageSetupApplyPersisted === true, 'Page setup changes did not persist on apply.');
      expect(result.deleteConfirmShownOnCancel === true, 'Delete confirmation did not show before cancel.');
      expect(result.deleteCancelPreservedSection === true, 'Section delete cancel did not preserve the section.');
      expect(result.deleteConfirmShownOnConfirm === true, 'Delete confirmation did not show before confirm.');
      expect(result.deleteConfirmedRemovedSection === true, 'Section delete confirm did not remove the section.');
      expect(Array.isArray(result.outlineSections) && result.outlineSections.length >= 2, 'Document outline did not render section headers.');
      expect(Array.isArray(result.outlineHeadings) && result.outlineHeadings.includes('Sub 1') && result.outlineHeadings.includes('Sub 2'), 'Document outline did not render expected markdown headings.');
      expect(result.outlineNavigationSuccessful === true, 'Document outline heading click did not navigate to the correct section.');
      expect(result.outlineRenamedSectionPresent === true, 'Document outline was not rebuilt correctly after a section rename.');
      expect(result.outlineProjectStatsRefreshedAfterSave === true, 'Document outline project totals did not refresh after a save.');
      expect(typeof result.outlineSectionStats === 'string' && result.outlineSectionStats.includes('words'), `Expected section stats readout, got: ${result.outlineSectionStats}`);
      expect(typeof result.outlineProjectStats === 'string' && result.outlineProjectStats.includes('Project Totals:'), `Expected project stats summary, got: ${result.outlineProjectStats}`);
      expect(result.searchResultCount >= 2, `Expected multiple project search results, got ${result.searchResultCount}.`);
      expect(result.searchDeletedResultCleared === true, 'Deleted project search results were not cleared from the drawer.');
      expect(result.searchNavigationSuccessful === true, 'Project-wide search did not navigate to the correct section.');
    }
  },
  {
    name: 'browser-authoring-performance-smoke',
    path: '/test/fixtures/browser-authoring-performance-smoke.html',
    validate: (result) => {
      console.log(`[Perf] Outline render: ${result.outlineRenderMs?.toFixed(1)}ms`);
      console.log(`[Perf] Search execution: ${result.searchExecutionMs?.toFixed(1)}ms`);
      console.log(`[Perf] Search navigation: ${result.searchNavigationMs?.toFixed(1)}ms`);
      
      expect(typeof result.outlineRenderMs === 'number' && result.outlineRenderMs < 3000, `Outline took too long to build: ${result.outlineRenderMs}ms (limit: 3000ms)`);
      expect(typeof result.searchExecutionMs === 'number' && result.searchExecutionMs < 3000, `Search execution took too long: ${result.searchExecutionMs}ms (limit: 3000ms)`);
      expect(typeof result.searchNavigationMs === 'number' && result.searchNavigationMs < 3000, `Search navigation took too long: ${result.searchNavigationMs}ms (limit: 3000ms)`);
      expect(result.editorInputReady === true, 'Editor was not ready for input after search navigation.');
      expect(result.repeatedInteractionsStable === true, 'Repeated interactions caused a crash or hang.');
    }
  },
  {
    name: 'browser-opfs-persistence-smoke',
    path: '/test/fixtures/browser-opfs-persistence-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser OPFS persistence smoke reported failure.');
      expect(result.projectKind === 'opfs', `Expected OPFS project kind, got ${result.projectKind}.`);
      expect(result.recoveryPromptShown === false, 'A stale draft should not reopen with a recovery prompt after a successful save.');
      expect(result.reopenedText === 'Saved durable text', `Expected reopened text to match saved content, got ${result.reopenedText}.`);
      expect(result.savedMarkerPresent === true, 'Saved marker was not persisted for the reopened OPFS section.');
    }
  },
  {
    name: 'browser-responsive-shell-laptop-smoke',
    path: '/test/fixtures/browser-responsive-shell-smoke.html?mode=laptop',
    viewport: { width: 1024, height: 768, deviceScaleFactor: 1 },
    validate(result) {
      expect(result.ok === true, 'Responsive laptop smoke reported failure.');
      expect(result.viewport.width === 1024, `Expected 1024px laptop viewport, got ${result.viewport.width}.`);
      expect(result.editorRightOfExplorer === true, 'Editor should remain to the right of explorer on laptop-sized widths.');
      expect(result.previewBelowEditor === true, 'Preview should move below the editor in the laptop split layout.');
      expect(result.editorPreviewDoNotOverlap === true, 'Editor and preview should not overlap in the laptop layout.');
      expect(result.modalWidth <= 1008, `Responsive modal width overflowed the laptop viewport (${result.modalWidth}).`);
    }
  },
  {
    name: 'browser-responsive-shell-tablet-smoke',
    path: '/test/fixtures/browser-responsive-shell-smoke.html?mode=tablet',
    viewport: { width: 820, height: 1180, deviceScaleFactor: 1 },
    validate(result) {
      expect(result.ok === true, 'Responsive tablet smoke reported failure.');
      expect(result.viewport.width === 820, `Expected 820px tablet viewport, got ${result.viewport.width}.`);
      expect(result.editorBelowExplorer === true, 'Editor should stack below explorer on tablet portrait widths.');
      expect(result.previewBelowEditor === true, 'Preview should stack below editor on tablet portrait widths.');
      expect(result.editorPreviewDoNotOverlap === true, 'Editor and preview should not overlap on tablet portrait widths.');
      expect(result.modalWidth <= 804, `Responsive modal width overflowed the tablet viewport (${result.modalWidth}).`);
    }
  },
  {
    name: 'browser-recovery-smoke',
    path: '/test/fixtures/browser-recovery-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser recovery smoke reported failure.');
      expect(result.projectKind === 'directory', `Expected directory project after recovery, got ${result.projectKind}.`);
      expect(result.confirmTitle === 'Settings Recovery', `Expected settings recovery dialog, got ${result.confirmTitle}.`);
      expect(
        typeof result.confirmMessage === 'string' && result.confirmMessage.includes('malformed JSON'),
        'Recovery prompt did not explain the broken settings file.'
      );
      expect(
        typeof result.confirmMessage === 'string' && result.confirmMessage.includes('keep a backup'),
        'Recovery prompt did not explain the backup behavior.'
      );
      expect(
        typeof result.recoveryNotice === 'string' && result.recoveryNotice.includes('Project settings were recovered successfully.'),
        'Recovery success notice was not shown.'
      );
      expect(Array.isArray(result.backupFiles) && result.backupFiles.length >= 1, 'Recovery did not create a settings backup file.');
      expect(result.repairedSettingsLooksValid === true, 'Recovered settings.json was not rewritten to a valid settings object.');
    }
  },
  {
    name: 'browser-local-directory-reopen-smoke',
    path: '/test/fixtures/browser-local-directory-reopen-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser local-directory reopen smoke reported failure.');
      expect(result.projectKind === 'directory', `Expected directory project kind, got ${result.projectKind}.`);
      expect(result.projectId === result.initialProjectId, 'Recent local-directory reopen did not restore the same workspace id.');
      expect(Array.isArray(result.sectionPaths) && result.sectionPaths.includes('sections/FolderSaved.md'), 'Recent local-directory reopen lost the saved section.');
      expect(typeof result.templateContent === 'string' && result.templateContent.includes('# Chapter'), 'Local-directory template content was not preserved.');
      expect(result.pickerCalls === 1, `Expected reopen-from-recents to avoid a second picker prompt, got ${result.pickerCalls} picker calls.`);
    }
  },
  {
    name: 'pdf-visual',
    path: '/test/fixtures/pdf-visual.html',
    validate(result) {
      expect(result.ok === true, 'PDF visual fixture reported failure.');
      expect(result.pageCount === 2, `Expected 2 pages in PDF visual smoke, got ${result.pageCount}.`);
      expect(result.glyphPage === 1, `Expected glyph anchor on page 1, got ${result.glyphPage}.`);
      expect(result.forcedBreakPage === 2, `Expected forced page-break anchor on page 2, got ${result.forcedBreakPage}.`);
      expect(result.headersPresent === true, 'PDF visual smoke lost expected header content.');
      expect(result.footersPresent === true, 'PDF visual smoke lost expected footer content.');
      expect(result.chapterFootersResolved === true, 'PDF visual smoke duplicated or lost the resolved chapter footer.');
    }
  }
];

const viteServer = await createServer({
  root,
  appType: 'spa',
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: serverPort,
    strictPort: true,
    hmr: false
  }
});

let browserProcess;

try {
  await viteServer.listen();
  browserProcess = launchHeadlessBrowser(browserExecutable, browserDebugPort, userDataDir);
  const browserVersion = await waitForJson(`http://127.0.0.1:${browserDebugPort}/json/version`);

  const results = [];
  for (const fixture of fixtures) {
    process.stdout.write(`Running browser fixture: ${fixture.name}\n`);
    const target = await createBrowserTarget(browserDebugPort, `http://127.0.0.1:${serverPort}${fixture.path}`);
    const session = await connectToTarget(target.webSocketDebuggerUrl);
    try {
      if (fixture.viewport) {
        await session.setViewport(fixture.viewport);
      }
      const result = await waitForHarnessResult(session);
      if (result?.ok !== true) {
        console.error('Fixture returned failure result:', JSON.stringify(result, null, 2));
        throw new Error(`${fixture.name} returned failure: ${JSON.stringify(result)}`);
      }
      fixture.validate(result);
      results.push({ name: fixture.name, ok: true, result });
    } finally {
      await closeQuietly(session);
      if (target.id) {
        await closeBrowserTarget(browserDebugPort, target.id).catch(() => undefined);
      }
    }
  }

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    browser: {
      executable: browserExecutable,
      userAgent: browserVersion.UserAgent
    },
    fixtures: results.map(({ name, ok }) => ({ name, ok }))
  }, null, 2)}\n`);
} finally {
  if (browserProcess && !browserProcess.killed) {
    browserProcess.kill('SIGTERM');
    await once(browserProcess, 'exit').catch(() => undefined);
  }
  await viteServer.close();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

function launchHeadlessBrowser(executable, debugPort, userDataDir) {
  return spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'pipe']
  });
}

async function detectBrowserExecutable() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  throw new Error('No supported headless browser was found. Install Microsoft Edge or Google Chrome.');
}

async function createBrowserTarget(debugPort, url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT'
  });
  if (!response.ok) throw new Error(`Failed to create browser target (${response.status}).`);
  return response.json();
}

async function closeBrowserTarget(debugPort, targetId) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/close/${encodeURIComponent(targetId)}`);
  if (!response.ok) {
    throw new Error(`Failed to close browser target ${targetId} (${response.status}).`);
  }
}

async function waitForJson(url, attempts = 50) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`Unexpected HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function connectToTarget(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await once(socket, 'open');

  let nextId = 0;
  const pending = new Map();

  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data));
    if (payload.id && pending.has(payload.id)) {
      const entry = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) entry.reject(new Error(payload.error.message || 'CDP command failed.'));
      else entry.resolve(payload.result);
    }
  });

  async function send(method, params = {}) {
    const id = ++nextId;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data));
    if (payload.method === 'Runtime.consoleAPICalled') {
      const type = payload.params.type;
      const args = payload.params.args.map(a => a.value || a.description).join(' ');
      console.log(`[Browser Console ${type}]`, args);
    } else if (payload.method === 'Runtime.exceptionThrown') {
      console.log(`[Browser Exception]`, payload.params.exceptionDetails.text);
    }
  });

  return {
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed.');
      }
      return result.result?.value;
    },
    async close() {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
        await once(socket, 'close').catch(() => undefined);
      }
    },
    async setViewport({ width, height, deviceScaleFactor = 1 }) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor,
        mobile: false
      });
    }
  };
}

async function waitForHarnessResult(session) {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const result = await session.evaluate(`window.__HARNESS_RESULT__ ?? null`);
    if (result) return result;
    await delay(100);
  }
  const progress = await session.evaluate(`window.__HARNESS_PROGRESS__ ?? null`).catch(() => null);
  throw new Error(`Browser smoke fixture did not finish within 60 seconds. Last progress: ${progress ?? 'unknown'}.`);
}

async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  server.close();
  await once(server, 'close');
  if (!port) throw new Error('Failed to reserve a local port.');
  return port;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function closeQuietly(session) {
  if (!session) return;
  await session.close().catch(() => undefined);
}
