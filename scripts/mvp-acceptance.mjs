import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { plainCharacterReferenceEsbuildPlugin, workerDomFreeResolution } from '../vite.shared.ts';
import { detectBrowserExecutable, launchHeadlessBrowser, reservePort, waitForJson } from './lib/browser.mjs';

// One end-to-end run of the MVP through the real application UI in desktop Chromium, with no in-page shortcuts:
// create a browser-storage project, create a section, type, watch the save status, reload, simulate a crash and
// recover the unsaved draft, check the preview, export a PDF, then delete the section and restore it from the trash.
// Every step must pass. Screenshots and the PDF go to CLEAR_WRITER_ACCEPTANCE_DIR (default: a temporary folder).

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const outDir = process.env.CLEAR_WRITER_ACCEPTANCE_DIR ?? await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-acceptance-'));
await fs.mkdir(outDir, { recursive: true });
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-acceptance-profile-'));
const executable = await detectBrowserExecutable();

/** Chromium's headless shell, which can print a page to PDF. Full Chrome in new headless mode cannot. */
async function findHeadlessShell() {
  if (process.env.CLEAR_WRITER_PDF_BROWSER) return process.env.CLEAR_WRITER_PDF_BROWSER;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const folders = await fs.readdir(base).catch(() => []);
  for (const folder of folders.filter(name => name.startsWith('chromium_headless_shell'))) {
    const candidate = path.join(base, folder, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (await fs.access(candidate).then(() => true, () => false)) return candidate;
  }
  return null;
}

const PROJECT = 'Acceptance Novel';
const SECTION = 'Chapter One';
const CHAPTER_TEXT = [
  '# Chapter One',
  '',
  'It was a quiet morning in the harbour town, and the fishing boats rocked against their moorings.',
  '',
  'Maren walked down to the water with a notebook under her arm.'
].join('\n');
const UNSAVED_TEXT = '\n\nUNSAVED-MARKER the tide turned before she had written a single word of the second page, and she kept typing as the gulls wheeled overhead and the bell rang out across the quiet water of the bay.';

const server = await createServer({
  root,
  appType: 'spa',
  optimizeDeps: {
    include: ['extend', 'debug', 'event-emitter', 'event-emitter/pipe', 'css-tree', 'clear-cut'],
    esbuildOptions: { plugins: [plainCharacterReferenceEsbuildPlugin()] }
  },
  worker: { format: 'es', plugins: () => [workerDomFreeResolution()] },
  logLevel: 'error',
  server: { host: '127.0.0.1', port: await reservePort(), strictPort: true, hmr: false }
});
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');

let session = null;
const report = [];
const problems = [];

async function launch() {
  const port = await reservePort();
  const child = launchHeadlessBrowser(executable, port, profileDir, []);
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] ?? await browser.newContext();
  // The app prints from a popup. Headless Chromium has no print dialog and closes the popup at once, so print is
  // replaced by a recorder in every window; the popup stays open, and the run prints its document to a PDF itself.
  await context.addInitScript(() => {
    window.print = () => { window.__clearWriterPrintCalls = (window.__clearWriterPrintCalls ?? 0) + 1; };
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on('pageerror', error => problems.push(`page error: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') problems.push(`console error: ${message.text().slice(0, 200)}`); });
  return { child, browser, context, page };
}

async function stop(current) {
  current.child.kill('SIGKILL');
  await once(current.child, 'exit');
}

async function shot(name) {
  await session.page.screenshot({ path: path.join(outDir, `${name}.png`) });
}

async function openApp() {
  await session.page.goto(`${origin}/`);
  await session.page.waitForFunction(() => window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__), null, { timeout: 60_000 });
  const bootError = await session.page.evaluate(() => window.__CLEAR_WRITER_BOOT_ERROR__ ?? null);
  if (bootError) throw new Error(`The app failed to start: ${bootError}`);
}

/** Reopens the project after a reload or restart, from the recent list if it did not reopen by itself. */
async function reopenProject() {
  const { page } = session;
  await page.waitForTimeout(1500);
  if (await page.locator('#task-explorer-view:not(.hidden)').count() === 0) {
    await page.locator('.welcome-recent-item').first().click({ timeout: 15_000 });
  }
  await page.locator('#task-explorer-view:not(.hidden)').waitFor({ timeout: 30_000 });
}

const editorText = () => session.page.locator('.cm-content').innerText();
const status = () => session.page.locator('#editor-status').innerText();
const normalize = text => text.replace(/\s+/g, ' ').trim();

async function openSection() {
  await session.page.locator(`.task-explorer-item[aria-label="Section ${SECTION}.md"]`).click({ timeout: 15_000 });
  await session.page.locator('.cm-content').waitFor({ timeout: 15_000 });
}

async function waitForStatus(expected, timeout = 15_000) {
  await session.page.waitForFunction(text => document.getElementById('editor-status')?.textContent === text, expected, { timeout });
}

async function step(name, run) {
  const started = Date.now();
  try {
    const detail = await run();
    report.push({ step: name, ok: true, ms: Date.now() - started, detail });
    process.stdout.write(`PASS ${name}${detail ? ` - ${detail}` : ''}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    report.push({ step: name, ok: false, ms: Date.now() - started, detail: message });
    process.stdout.write(`FAIL ${name} - ${message}\n`);
    await shot(`failed-${report.length}`).catch(() => undefined);
    throw error;
  }
}

try {
  session = await launch();

  await step('1. Create a browser-storage project (no local-folder option offered)', async () => {
    await openApp();
    await shot('01-welcome');
    await session.page.locator('#empty-canvas-new-project').click();
    await session.page.locator('#btn-modal-new-opfs').waitFor();
    const folderOptions = await session.page.locator('#btn-modal-new-dir').count();
    if (folderOptions !== 0) throw new Error('The new-project dialog offered a local folder.');
    await session.page.locator('#btn-modal-new-opfs').click();
    await session.page.locator('#input-opfs-name').fill(PROJECT);
    await session.page.locator('#btn-modal-new-opfs-confirm').click();
    await session.page.locator('#task-explorer-view:not(.hidden)').waitFor({ timeout: 30_000 });
    const name = await session.page.locator('#project-name').innerText();
    if (name !== PROJECT) throw new Error(`The project is named "${name}".`);
    await shot('02-project');
    return `project "${name}"`;
  });

  await step('2. Create a section from the explorer', async () => {
    await session.page.locator('#btn-task-new-section').click();
    const field = session.page.locator('#project-flow-modal input');
    await field.waitFor();
    await field.fill(SECTION);
    await field.press('Enter');
    await session.page.locator(`.task-explorer-item[aria-label="Section ${SECTION}.md"]`).waitFor({ timeout: 15_000 });
    return `${SECTION}.md`;
  });

  await step('3. Edit: type, and the status shows unsaved then saved', async () => {
    await openSection();
    await session.page.locator('.cm-content').click();
    // A new section opens with a template; replace it with the chapter text.
    await session.page.keyboard.press('Control+A');
    await session.page.keyboard.type(CHAPTER_TEXT, { delay: 8 });
    const during = await status();
    await waitForStatus('Saved');
    if (normalize(await editorText()) !== normalize(CHAPTER_TEXT)) throw new Error('The editor does not hold the typed text.');
    await shot('03-typed');
    return `status went "${during}" -> "Saved"`;
  });

  await step('4. Reload: the project and the text are still there', async () => {
    await openApp();
    await reopenProject();
    await openSection();
    if (normalize(await editorText()) !== normalize(CHAPTER_TEXT)) throw new Error(`After reload the editor holds: ${normalize(await editorText()).slice(0, 80)}`);
    await shot('04-reloaded');
    return 'text persisted';
  });

  let draftSeenWhileStatus = '';
  await step('5a. Crash with unsaved typing: a recovery draft is written, the file is not', async () => {
    await session.page.locator('.cm-content').click();
    await session.page.keyboard.press('Control+End');
    // Keep typing without a pause: autosave waits for a pause, drafts are written at least every five seconds.
    const typing = session.page.keyboard.type(UNSAVED_TEXT, { delay: 60 }).catch(() => undefined);
    const deadline = Date.now() + 30_000;
    let draft = false;
    while (Date.now() < deadline && !draft) {
      await new Promise(resolve => setTimeout(resolve, 300));
      draft = await session.page.evaluate(() => new Promise(resolve => {
        const request = indexedDB.open('clear-writer-drafts');
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('drafts')) { database.close(); resolve(false); return; }
          const all = database.transaction('drafts').objectStore('drafts').getAll();
          all.onsuccess = () => { database.close(); resolve(all.result.some(record => String(record.content).includes('UNSAVED-MARKER'))); };
          all.onerror = () => { database.close(); resolve(false); };
        };
      })).catch(() => false);
    }
    if (!draft) throw new Error('No recovery draft was written while typing.');
    draftSeenWhileStatus = await status();
    await shot('05-before-crash');
    await stop(session);
    void typing;
    return `status at the crash: "${draftSeenWhileStatus}"`;
  });

  await step('5b. Restart: the app offers the draft, and restoring it saves it', async () => {
    session = await launch();
    await openApp();
    await reopenProject();
    await session.page.locator(`.task-explorer-item[aria-label="Section ${SECTION}.md"]`).click();
    const title = session.page.locator('#confirm-modal-title');
    await title.waitFor({ timeout: 20_000 });
    const heading = await title.innerText();
    await shot('06-draft-prompt');
    if (heading !== 'Unsaved Draft Found') throw new Error(`The prompt is "${heading}".`);
    await session.page.locator('#btn-confirm-ok').click();
    await session.page.locator('.cm-content').waitFor();
    await session.page.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('UNSAVED-MARKER'), null, { timeout: 15_000 });
    const notice = await session.page.locator('#notice-container').innerText();
    if (!/restored your unsaved draft/i.test(notice)) throw new Error(`No restore notice was shown: ${notice.slice(0, 100)}`);
    await waitForStatus('Saved', 20_000);
    await shot('07-draft-restored');
    // The restored text must be in the project now: reload and read it back.
    await openApp();
    await reopenProject();
    await openSection();
    if (!(await editorText()).includes('UNSAVED-MARKER')) throw new Error('The restored draft was not saved to the project.');
    return 'draft restored, announced, saved, and present after a reload';
  });

  await step('6. Preview shows the document', async () => {
    await session.page.waitForFunction(() => document.querySelectorAll('.pagedjs_page').length > 0, null, { timeout: 60_000 });
    const text = await session.page.locator('#paged-stage').innerText();
    if (!text.includes('quiet morning')) throw new Error('The preview does not show the chapter text.');
    await shot('08-preview');
    return `${await session.page.locator('.pagedjs_page').count()} page(s)`;
  });

  await step('7. Export a PDF', async () => {
    const popupPromise = session.context.waitForEvent('page', { timeout: 60_000 });
    await session.page.locator('#btn-pdf-preview').click();
    const popup = await popupPromise;
    await popup.locator('#clear-writer-pdf-preview-document').waitFor({ timeout: 60_000 });
    await popup.waitForFunction(() => (window.__clearWriterPrintCalls ?? 0) > 0, null, { timeout: 60_000 });
    const printCalls = await popup.evaluate(() => window.__clearWriterPrintCalls);
    const documentPages = await popup.locator('.pagedjs_page').count();
    const documentText = await popup.locator('#clear-writer-pdf-preview-document').innerText();
    if (documentPages < 1) throw new Error('The document the app prepared for printing has no pages.');
    if (!documentText.includes('quiet morning')) throw new Error('The document the app prepared for printing is missing the chapter text.');
    await popup.screenshot({ path: path.join(outDir, '09-print-window.png') });
    const html = await popup.content();
    await popup.close().catch(() => undefined);

    // Print the prepared document to a PDF in Chromium's headless shell, which has a print-to-PDF path.
    const shellPath = await findHeadlessShell();
    if (!shellPath) return `the app prepared ${documentPages} page(s) and called print ${printCalls} time(s); no headless shell was found, so no PDF file was made`;
    const shell = await chromium.launch({ executablePath: shellPath, args: ['--no-sandbox'] });
    try {
      const printer = await shell.newPage();
      await printer.setContent(html, { waitUntil: 'load' });
      const pdf = await printer.pdf({ preferCSSPageSize: true, printBackground: true });
      await fs.writeFile(path.join(outDir, 'chapter-one.pdf'), pdf);
      const text = pdf.toString('latin1');
      if (!text.startsWith('%PDF-')) throw new Error('The output is not a PDF.');
      const pdfPages = (text.match(/\/Type\s*\/Page\b/g) ?? []).length;
      if (pdfPages !== documentPages) throw new Error(`The PDF has ${pdfPages} page(s), but the app prepared ${documentPages}.`);
      return `the app prepared ${documentPages} page(s) and called print ${printCalls} time(s); PDF of ${pdf.length} bytes, ${pdfPages} page(s)`;
    } finally {
      await shell.close();
    }
  });

  await step('8. Delete the section, then restore it from the trash', async () => {
    const item = session.page.locator(`.task-explorer-item[aria-label="Section ${SECTION}.md"]`);
    await item.hover();
    await item.locator('.task-explorer-item-action--danger').click();
    await session.page.locator('#btn-confirm-ok').click();
    await item.waitFor({ state: 'detached', timeout: 15_000 });
    await shot('10-deleted');
    await session.page.locator('#btn-task-trash').click();
    const row = session.page.locator('.trash-item', { hasText: `${SECTION}.md` });
    await row.waitFor({ timeout: 15_000 });
    await shot('11-trash');
    await row.locator('[data-action="restore"]').click();
    await session.page.waitForFunction(() => document.getElementById('trash-dialog-status')?.textContent?.startsWith('Restored'), null, { timeout: 15_000 });
    const announced = await session.page.locator('#trash-dialog-status').innerText();
    await session.page.locator('#trash-close').click();
    await openSection();
    if (!(await editorText()).includes('UNSAVED-MARKER')) throw new Error('The restored section lost its text.');
    await shot('12-restored');
    return announced;
  });

  if (problems.length > 0) {
    const unexpected = problems.filter(message => !/net::ERR_ABORTED|favicon/i.test(message));
    if (unexpected.length > 0) throw new Error(`The browser reported errors: ${unexpected.slice(0, 3).join(' | ')}`);
  }
} catch (error) {
  process.exitCode = 1;
  if (!report.some(item => !item.ok)) process.stdout.write(`ERROR ${error instanceof Error ? error.message : String(error)}\n`);
} finally {
  if (session) await stop(session).catch(() => undefined);
  await server.close();
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify({ outDir, steps: report, browserProblems: problems }, null, 2));
  await fs.rm(profileDir, { recursive: true, force: true });
  process.stdout.write(`\n${report.filter(item => item.ok).length} of ${report.length} steps passed. Output: ${outDir}\n`);
  process.exit(process.exitCode ?? 0);
}
