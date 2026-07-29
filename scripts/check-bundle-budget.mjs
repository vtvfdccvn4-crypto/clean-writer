import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const assetsDir = path.join(root, 'dist-web', 'assets');
// The JSON printed to stdout is the CI artifact. Keep the local copy under
// the already-ignored temp directory so a routine budget check stays clean.
const reportPath = path.resolve(root, process.env.CLEAR_WRITER_BUNDLE_REPORT ?? 'tmp/bundle-baseline.json');
const initialChunkBudgetBytes = Number(process.env.CLEAR_WRITER_INITIAL_CHUNK_BUDGET ?? 500 * 1024);

const entries = await fs.readdir(assetsDir, { withFileTypes: true });
const javascriptFiles = entries
  .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
  .map(entry => entry.name);
if (javascriptFiles.length === 0) {
  throw new Error('No production JavaScript chunks found. Run npm run build first.');
}

const chunks = await Promise.all(javascriptFiles.map(async name => {
  const buffer = await fs.readFile(path.join(assetsDir, name));
  return {
    name,
    bytes: buffer.byteLength,
    gzipBytes: gzipSync(buffer, { level: 9 }).byteLength
  };
}));
chunks.sort((left, right) => right.bytes - left.bytes);

const initialChunk = chunks.find(chunk => /^app-[^/]+\.js$/.test(chunk.name)) ?? chunks[0];
const report = {
  generatedAt: new Date().toISOString(),
  initialChunkBudgetBytes,
  initialChunk: {
    ...initialChunk,
    withinBudget: initialChunk.bytes <= initialChunkBudgetBytes
  },
  javascriptChunkCount: chunks.length,
  javascriptChunks: chunks
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
if (!report.initialChunk.withinBudget) {
  throw new Error(`Initial JavaScript chunk exceeds the ${initialChunkBudgetBytes}-byte budget: ${initialChunk.name} is ${initialChunk.bytes} bytes.`);
}
