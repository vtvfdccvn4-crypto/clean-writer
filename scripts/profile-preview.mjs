import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const projectArgument = readArgument('--project');
const sampleCount = positiveInteger(readArgument('--samples'), 5);
const server = await createServer({
  root,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false }
});

try {
  const { compileMarkdown } = await server.ssrLoadModule('/src/compiler/index.ts');
  const { buildFullDocumentMarkdown } = await server.ssrLoadModule('/src/preview/document-rendering/index.ts');
  const scenarios = [
    syntheticScenario('small', 5, 12),
    syntheticScenario('medium', 25, 20),
    syntheticScenario('large', 100, 28)
  ];

  if (projectArgument) {
    const projectScenario = await loadProjectScenario(path.resolve(projectArgument));
    if (projectScenario) scenarios.push(projectScenario);
  }

  const results = [];
  for (const scenario of scenarios) {
    results.push(await profileScenario(scenario, compileMarkdown, buildFullDocumentMarkdown));
  }

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    samples: sampleCount,
    runtime: process.version,
    scenarios: results
  }, null, 2)}\n`);
} finally {
  await server.close();
}

async function profileScenario(scenario, compileMarkdown, buildFullDocumentMarkdown) {
  const sections = scenario.blocks.map((block, index) => ({
    path: block.path,
    isDir: false,
    pageBreak: index > 0
  }));
  const assemblySamples = [];
  const compileSamples = [];
  let markdown = '';
  let htmlLength = 0;

  // Warm the module graph and JIT before collecting samples.
  markdown = buildFullDocumentMarkdown(sections, scenario.blocks);
  await compileMarkdown(markdown, scenario.projectPath);

  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  let peakHeap = heapBefore;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const assemblyStarted = performance.now();
    markdown = buildFullDocumentMarkdown(sections, scenario.blocks);
    assemblySamples.push(performance.now() - assemblyStarted);

    const compileStarted = performance.now();
    const html = await compileMarkdown(markdown, scenario.projectPath);
    compileSamples.push(performance.now() - compileStarted);
    htmlLength = html.length;
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  }
  globalThis.gc?.();
  const heapAfter = process.memoryUsage().heapUsed;

  const singleMarkdown = scenario.blocks[Math.floor(scenario.blocks.length / 2)]?.markdown ?? '';
  const singleSamples = [];
  await compileMarkdown(singleMarkdown, scenario.projectPath);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const started = performance.now();
    await compileMarkdown(singleMarkdown, scenario.projectPath);
    singleSamples.push(performance.now() - started);
  }

  return {
    name: scenario.name,
    sections: scenario.blocks.length,
    markdownCharacters: markdown.length,
    htmlCharacters: htmlLength,
    assemblyMs: summarize(assemblySamples),
    fullCompileMs: summarize(compileSamples),
    representativeSectionCompileMs: summarize(singleSamples),
    peakHeapGrowthMiB: round((peakHeap - heapBefore) / 1024 / 1024),
    retainedHeapGrowthMiB: round((heapAfter - heapBefore) / 1024 / 1024)
  };
}

function syntheticScenario(name, sectionCount, paragraphCount) {
  const blocks = Array.from({ length: sectionCount }, (_, sectionIndex) => ({
    path: `Chapter ${String(sectionIndex + 1).padStart(3, '0')}.md`,
    pageBreak: sectionIndex > 0,
    markdown: syntheticMarkdown(sectionIndex + 1, paragraphCount)
  }));
  return { name, blocks, projectPath: undefined };
}

function syntheticMarkdown(sectionNumber, paragraphCount) {
  const paragraphs = Array.from({ length: paragraphCount }, (_, index) =>
    `Paragraph ${index + 1} describes calibration, validation, traceability, and controlled ` +
    `configuration changes for instrument module ${sectionNumber}. The procedure records ` +
    `measured values, expected tolerances, review evidence, and follow-up actions.`
  );
  return [
    `# Instrument Module ${sectionNumber}`,
    '',
    ...paragraphs.flatMap(paragraph => [paragraph, '']),
    '## Verification checklist',
    '',
    '- Confirm the controlled input.',
    '- Record the observed output.',
    '- Review deviations and corrective actions.',
    '',
    '| Parameter | Expected | Result |',
    '| --- | ---: | --- |',
    '| Gain | 1.00 | Pass |',
    '| Offset | 0.00 | Pass |'
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
    return { name: `project:${path.basename(projectPath)}`, blocks, projectPath };
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

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    min: round(sorted[0] ?? 0),
    max: round(sorted.at(-1) ?? 0)
  };
}

function percentile(sorted, quantile) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index];
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
