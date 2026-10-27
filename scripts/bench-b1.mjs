/**
 * B1 measurement harness: runs the keyboard-latency typing bench on the 1,000-page
 * corpus, writes results to reports/b1-latest.json, and compares them against
 * reports/b1-baseline.json when that file is present.
 *
 * Usage: node scripts/bench-b1.mjs [--keystrokes N] [--save-baseline]
 *   --keystrokes N      Type N keys (default 200).
 *   --save-baseline     Write results to reports/b1-baseline.json as the new baseline.
 *
 * Exit codes:
 *   0  All gates pass (no long task >50 ms; p95 latency ≤100 ms).
 *   1  A gate failed or the script itself errored.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const latestPath = path.join(root, 'reports', 'b1-latest.json');
const baselinePath = path.join(root, 'reports', 'b1-baseline.json');

const args = process.argv.slice(2);
const saveBaseline = args.includes('--save-baseline');
const keystrokesArg = (() => {
  const idx = args.indexOf('--keystrokes');
  return idx !== -1 ? args[idx + 1] : undefined;
})();

console.log('B1 benchmark: typing latency on the 1,000-page corpus');
console.log('─'.repeat(56));

let result;
try {
  const scriptArgs = ['scripts/typing-input-latency.mjs', '--output', latestPath];
  if (keystrokesArg) scriptArgs.push('--keystrokes', keystrokesArg);
  const { stdout, stderr } = await run(process.execPath, scriptArgs, { cwd: root, timeout: 300_000 });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  result = JSON.parse(await fs.readFile(latestPath, 'utf8'));
} catch (error) {
  console.error('Bench failed:', error.message ?? error);
  process.exit(1);
}

const { gate, keystrokeToNextFrameMs, longTaskMaxMs, longTaskCount, longTasksOver50msCount } = result;

console.log('');
console.log('Results');
console.log(`  p50 latency      ${keystrokeToNextFrameMs?.p50 ?? '—'} ms`);
console.log(`  p95 latency      ${keystrokeToNextFrameMs?.p95 ?? '—'} ms   (gate: ≤100 ms)`);
console.log(`  max latency      ${keystrokeToNextFrameMs?.max ?? '—'} ms`);
console.log(`  long tasks       ${longTaskCount}  (over 50 ms: ${longTasksOver50msCount})   (gate: 0)`);
console.log(`  long task max    ${longTaskMaxMs} ms`);
console.log('');

// Compare against baseline when present.
let baselineResult = null;
try { baselineResult = JSON.parse(await fs.readFile(baselinePath, 'utf8')); } catch { /* no baseline */ }

if (baselineResult) {
  const prevP95 = baselineResult.keystrokeToNextFrameMs?.p95;
  const currP95 = keystrokeToNextFrameMs?.p95;
  if (prevP95 != null && currP95 != null) {
    const delta = currP95 - prevP95;
    const sign = delta > 0 ? '+' : '';
    console.log(`  vs baseline p95  ${sign}${Math.round(delta)} ms  (was ${prevP95} ms)`);
  }
} else {
  console.log('  (no baseline on record — run with --save-baseline to set one)');
}
console.log('');

const passed = gate?.noLongTaskOver50ms && gate?.p95LatencyAtOrBelow100ms;
if (passed) {
  console.log('PASS  Both gates met.');
} else {
  console.log('FAIL  Gate(s) not met:');
  if (!gate?.noLongTaskOver50ms) console.log(`  ✗  ${longTasksOver50msCount} long task(s) over 50 ms (max ${longTaskMaxMs} ms)`);
  if (!gate?.p95LatencyAtOrBelow100ms) console.log(`  ✗  p95 latency ${keystrokeToNextFrameMs?.p95} ms > 100 ms`);
}
console.log('');

if (saveBaseline) {
  await fs.copyFile(latestPath, baselinePath);
  console.log(`Baseline saved to reports/b1-baseline.json`);
}

process.exit(passed ? 0 : 1);
