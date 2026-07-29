import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const projectArgument = readArgument('--project');
const sampleCount = positiveInteger(readArgument('--samples'), 3);
const scaleMode = process.argv.includes('--scale');
const contentProfileMode = process.argv.includes('--content-profile');
const layoutProfileMode = process.argv.includes('--layout-profile');
const requestedScalePages = positiveInteger(readArgument('--pages'), null);
const requestedContentPages = readArgument('--content-pages');
const requestedLayoutPages = positiveInteger(readArgument('--layout-pages'), 260);
const outputArgument = readArgument('--output');
const evaluationTimeoutMs = positiveInteger(
  process.env.CLEAR_WRITER_PROFILE_TIMEOUT_MS,
  scaleMode ? 150_000 : 180_000
);
const serverPort = await reservePort();
const browserDebugPort = await reservePort();
const fixturePath = '/test/fixtures/pagination-profile.html';

const browserExecutable = await detectBrowserExecutable();
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-pagination-profile-'));
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
let browserSession;
let scenarios = [];
let browserVersion = {};

try {
  await viteServer.listen();

  const { compileMarkdown } = await viteServer.ssrLoadModule('/src/compiler/index.ts');
  const { buildFullDocumentMarkdown } = await viteServer.ssrLoadModule('/src/preview/document-rendering/index.ts');
  scenarios = await buildScenarios(buildFullDocumentMarkdown, compileMarkdown);

  browserProcess = launchHeadlessBrowser(browserExecutable, browserDebugPort, userDataDir);
  browserVersion = await waitForJson(`http://127.0.0.1:${browserDebugPort}/json/version`);
  const target = await createBrowserTarget(browserDebugPort, `http://127.0.0.1:${serverPort}${fixturePath}`);
  browserSession = await connectToTarget(target.webSocketDebuggerUrl);
  await waitForProfilerReady(browserSession);

  const profile = await browserSession.evaluate(
    `window.__RUN_PAGINATION_PROFILE__(${JSON.stringify({ samples: sampleCount, scenarios })})`,
    evaluationTimeoutMs
  );

  const report = {
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    browser: {
      executable: browserExecutable,
      userAgent: browserVersion.UserAgent
    },
    samples: sampleCount,
    profile: layoutProfileMode ? 'layout-ablation' : contentProfileMode ? 'content-classification' : scaleMode ? 'scale' : 'standard',
    scenarios: profile.scenarios,
    cancellation: profile.cancellation
  };
  await writeReport(report);
  if (scaleMode && (profile.scenarios.some(result => result.passed !== true) || profile.cancellation?.passed !== true)) {
    process.exitCode = 1;
  }
} catch (error) {
  const report = {
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    browser: { executable: browserExecutable, userAgent: browserVersion.UserAgent ?? null },
    samples: sampleCount,
    evaluationTimeoutMs,
    scenarios: scenarios.map(scenario => ({ name: scenario.name, expectedMinimumPages: scenario.expectedMinimumPages })),
    failure: {
      phase: 'browser-evaluation',
      message: error instanceof Error ? error.message : String(error)
    }
  };
  await writeReport(report);
  process.exitCode = 1;
} finally {
  await closeQuietly(browserSession);
  if (browserProcess && !browserProcess.killed) {
    browserProcess.kill('SIGTERM');
    await Promise.race([once(browserProcess, 'exit'), delay(1_000)]).catch(() => undefined);
    if (browserProcess.exitCode === null) browserProcess.kill('SIGKILL');
  }
  await viteServer.close();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

async function buildScenarios(buildFullDocumentMarkdown, compileMarkdown) {
  if (layoutProfileMode) {
    const variants = ['baseline', 'all-margin-boxes', 'no-margin-boxes', 'minimal-page-css', 'no-forced-break-css'];
    return Promise.all(variants.map(variant => compileScenario(
      `layout-${variant}-${requestedLayoutPages}-pages`,
      {
        ...representativeScenario(requestedLayoutPages),
        expectedMinimumPages: variant === 'baseline' || variant === 'no-margin-boxes' ? requestedLayoutPages : 1,
        layoutVariant: variant
      },
      buildFullDocumentMarkdown,
      compileMarkdown
    )));
  }
  if (contentProfileMode) {
    const pageTargets = requestedContentPages
      ? requestedContentPages.split(',').map(value => positiveInteger(value.trim(), null)).filter(value => value !== null)
      : [50, 260];
    const contentKinds = ['text', 'headings', 'tables', 'images', 'mixed'];
    return Promise.all(contentKinds.flatMap(kind => pageTargets.map(pageTarget => compileScenario(
      `content-${kind}-${pageTarget}-pages`,
      contentScenario(kind, pageTarget),
      buildFullDocumentMarkdown,
      compileMarkdown
    ))));
  }
  if (scaleMode) {
    const pageTargets = requestedScalePages ? [requestedScalePages] : [50, 100, 200, 300];
    const scaleScenarios = await Promise.all(pageTargets.map(pageTarget => compileScenario(
      `scale-${pageTarget}-pages`,
      scaleScenario(pageTarget),
      buildFullDocumentMarkdown,
      compileMarkdown
    )));
    if (requestedScalePages) return scaleScenarios;
    return [...scaleScenarios, await compileScenario(
      'representative-240-pages',
      representativeScenario(240),
      buildFullDocumentMarkdown,
      compileMarkdown
    ), await compileScenario(
      'representative-260-pages',
      representativeScenario(260),
      buildFullDocumentMarkdown,
      compileMarkdown
    )];
  }

  const scenarios = [
    await compileScenario('small', syntheticScenario(5, 12), buildFullDocumentMarkdown, compileMarkdown),
    await compileScenario('medium', syntheticScenario(15, 18), buildFullDocumentMarkdown, compileMarkdown),
    await compileScenario('large', syntheticScenario(40, 24), buildFullDocumentMarkdown, compileMarkdown)
  ];

  if (projectArgument) {
    const loaded = await loadProjectScenario(path.resolve(projectArgument));
    if (loaded) {
      scenarios.push(await compileScenario(loaded.name, loaded, buildFullDocumentMarkdown, compileMarkdown));
    }
  }

  return scenarios;
}

function contentScenario(kind, pageTarget) {
  const sentinel = `CONTENT_${kind.toUpperCase()}_PAGE_${pageTarget}`;
  return {
    expectedMinimumPages: pageTarget,
    sentinel,
    blocks: Array.from({ length: pageTarget }, (_, sectionIndex) => ({
      path: `Content/${kind}/Section ${String(sectionIndex + 1).padStart(3, '0')}.md`,
      pageBreak: sectionIndex > 0,
      markdown: contentMarkdown(kind, sectionIndex + 1, pageTarget, sectionIndex === pageTarget - 1 ? sentinel : '')
    }))
  };
}

function contentMarkdown(kind, sectionNumber, pageTarget, sentinel) {
  const text = `This ${kind} workload measures pagination cost for section ${sectionNumber} in the ${pageTarget}-page content classification fixture.`;
  const headingContent = Array.from({ length: 6 }, (_, index) => `### Heading ${sectionNumber}.${index + 1}\n\n${text}`).join('\n\n');
  const tableContent = [
    '| Property | Owner | Status | Notes |',
    '| --- | --- | --- | --- |',
    ...Array.from({ length: 8 }, (_, index) => `| Item ${index + 1} | Team ${index % 3 + 1} | Verified | ${text} |`)
  ].join('\n');
  const image = '<img alt="Content profile image" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'60\'%3E%3Crect width=\'120\' height=\'60\' fill=\'%23263a5b\'/%3E%3C/svg%3E">';
  const imageContent = `${text}\n\n${image}\n\n${text}`;
  const mixedContent = `${text}\n\n${headingContent}\n\n${tableContent}\n\n${image}`;
  const body = kind === 'text' ? `${text}\n\n${text}\n\n${text}`
    : kind === 'headings' ? headingContent
      : kind === 'tables' ? tableContent
        : kind === 'images' ? imageContent
          : mixedContent;
  return [`# Content profile ${kind} ${sectionNumber}`, '', body, '', sentinel].filter(Boolean).join('\n');
}

async function compileScenario(name, scenario, buildFullDocumentMarkdown, compileMarkdown) {
  const sections = scenario.blocks.map((block, index) => ({
    path: block.path,
    isDir: false,
    pageBreak: index > 0
  }));
  const markdown = buildFullDocumentMarkdown(sections, scenario.blocks);
  const html = await compileMarkdown(markdown);
  return {
    name,
    html,
    expectedMinimumPages: scenario.expectedMinimumPages,
    sentinel: scenario.sentinel,
    layoutVariant: scenario.layoutVariant
  };
}

function scaleScenario(pageTarget) {
  const sentinel = `SCALE_SENTINEL_PAGE_${pageTarget}`;
  return {
    expectedMinimumPages: pageTarget,
    sentinel,
    blocks: Array.from({ length: pageTarget }, (_, sectionIndex) => ({
      path: `Scale ${String(sectionIndex + 1).padStart(3, '0')}.md`,
      pageBreak: sectionIndex > 0,
      markdown: scaleMarkdown(sectionIndex + 1, pageTarget, sectionIndex === pageTarget - 1 ? sentinel : '')
    }))
  };
}

function scaleMarkdown(sectionNumber, pageTarget, sentinel) {
  return [
    `# Scale section ${sectionNumber}`,
    '',
    `This deterministic pagination section is part of the ${pageTarget}-page regression workload.`,
    '',
    'The content is intentionally compact so each section occupies one physical page.',
    '',
    'Validation text: pagination, layout, headers, footers, and final-page preservation.',
    '',
    sentinel
  ].filter(Boolean).join('\n');
}

function representativeScenario(pageTarget) {
  const sentinel = `REPRESENTATIVE_SENTINEL_PAGE_${pageTarget}`;
  return {
    expectedMinimumPages: pageTarget,
    sentinel,
    blocks: Array.from({ length: pageTarget }, (_, sectionIndex) => ({
      path: `Representative/Chapter ${String(sectionIndex + 1).padStart(3, '0')}.md`,
      pageBreak: sectionIndex > 0,
      markdown: representativeMarkdown(sectionIndex + 1, pageTarget, sectionIndex === pageTarget - 1 ? sentinel : '')
    }))
  };
}

function representativeMarkdown(sectionNumber, pageTarget, sentinel) {
  return [
    `# Chapter ${sectionNumber}: Project delivery controls`,
    '',
    `This section belongs to the representative ${pageTarget}-page project document and verifies the PDF preview's real authoring structures.`,
    '',
    '## Delivery checklist',
    '',
    '- Confirm scope, dependencies, and ownership.',
    '- Record decisions and actions for the release review.',
    '- Preserve page headers, footers, images, and final-page content.',
    '',
    '| Control | Owner | Status |',
    '| --- | --- | --- |',
    `| Review ${sectionNumber} | Delivery team | Complete |`,
    '| PDF preview | Quality team | Verified |',
    '',
    '<img alt="Representative inline image" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'12\'%3E%3Crect width=\'24\' height=\'12\' fill=\'%23263a5b\'/%3E%3C/svg%3E">',
    '',
    sentinel
  ].filter(Boolean).join('\n');
}

function syntheticScenario(sectionCount, paragraphCount) {
  return {
    blocks: Array.from({ length: sectionCount }, (_, sectionIndex) => ({
      path: `Section ${String(sectionIndex + 1).padStart(3, '0')}.md`,
      pageBreak: sectionIndex > 0,
      markdown: syntheticMarkdown(sectionIndex + 1, paragraphCount)
    }))
  };
}

function syntheticMarkdown(sectionNumber, paragraphCount) {
  const paragraphs = Array.from({ length: paragraphCount }, (_, index) =>
    `Paragraph ${index + 1} describes validation, configuration tracking, tolerance review, and ` +
    `controlled authoring activity for section ${sectionNumber}. This text is intentionally long ` +
    `enough to produce stable pagination across warmed runs in the headless browser profiler.`
  );
  return [
    `# Profile section ${sectionNumber}`,
    '',
    ...paragraphs.flatMap(paragraph => [paragraph, '']),
    '## Verification notes',
    '',
    '- Confirm the rendered content remains deterministic.',
    '- Confirm the section still fits the pagination workload.',
    '',
    '| Parameter | Expected | Result |',
    '| --- | ---: | --- |',
    '| Latency | Low | Pass |',
    '| Stability | High | Pass |'
  ].join('\n');
}

async function loadProjectScenario(projectPath) {
  const sectionsRoot = path.join(projectPath, 'sections');
  try {
    const files = await markdownFiles(sectionsRoot);
    const blocks = await Promise.all(files.map(async filePath => ({
      path: path.relative(sectionsRoot, filePath).replaceAll('\\', '/'),
      pageBreak: true,
      markdown: await fs.readFile(filePath, 'utf8')
    })));
    return { name: `project:${path.basename(projectPath)}`, blocks };
  } catch (error) {
    process.stderr.write(`Skipping project profile: ${error instanceof Error ? error.message : String(error)}\n`);
    return null;
  }
}

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(candidate);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [candidate] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

function launchHeadlessBrowser(executable, debugPort, userDataDir) {
  return spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
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
    process.env.CLEAR_WRITER_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next browser.
    }
  }
  throw new Error('No supported headless browser was found. Set CLEAR_WRITER_BROWSER or install Edge, Chrome, or Chromium.');
}

async function createBrowserTarget(debugPort, url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT'
  });
  if (!response.ok) {
    throw new Error(`Failed to create browser target (${response.status}).`);
  }
  return response.json();
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

  return {
    async evaluate(expression, timeoutMs = 30_000) {
      const result = send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Browser evaluation timed out after ${timeoutMs}ms.`)), timeoutMs);
      });
      const evaluated = await Promise.race([result, timeout]);
      if (evaluated.exceptionDetails) {
        throw new Error(evaluated.exceptionDetails.text || 'Runtime evaluation failed.');
      }
      return evaluated.result?.value;
    },
    async close() {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
        await once(socket, 'close').catch(() => undefined);
      }
    }
  };
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

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function writeReport(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(serialized);
  if (!outputArgument) return;
  const outputPath = path.resolve(root, outputArgument);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized, 'utf8');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function closeQuietly(session) {
  if (!session) return;
  await session.close().catch(() => undefined);
}

async function waitForProfilerReady(browserSession) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const readiness = await browserSession.evaluate(`(() => ({
      ready: typeof window.__RUN_PAGINATION_PROFILE__ === 'function',
      state: document.readyState
    }))()`);
    if (readiness?.ready) return;
    await delay(100);
  }
  throw new Error('Pagination profiler fixture did not finish booting.');
}
