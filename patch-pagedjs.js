import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagedRoot = path.join(__dirname, 'node_modules', 'pagedjs');

const targets = [
  path.join(pagedRoot, 'src', 'utils', 'dom.js'),
  path.join(pagedRoot, 'lib', 'utils', 'dom.cjs'),
  path.join(pagedRoot, 'dist', 'paged.js'),
  path.join(pagedRoot, 'dist', 'paged.polyfill.js')
];

const functionNames = [
  'findElement',
  'nextSignificantNode',
  'previousSignificantNode',
  'nodeAfter',
  'nodeBefore'
];

let patchedFiles = 0;
let matchedFunctions = 0;

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  let content = fs.readFileSync(target, 'utf8');
  let changed = false;

  for (const functionName of functionNames) {
    const signature = new RegExp(`((?:export\\s+)?function\\s+${functionName}\\s*\\(\\s*([A-Za-z_$][\\w$]*)[^)]*\\)\\s*\\{)(?!\\s*if \\(![A-Za-z_$][\\w$]*\\) return null; \\/\\/ CLEAR_WRITER_NULL_GUARD)`);
    if (!new RegExp(`(?:export\\s+)?function\\s+${functionName}\\s*\\(`).test(content)) continue;
    matchedFunctions += 1;
    if (!signature.test(content)) continue;
    content = content.replace(signature, '$1\n\tif (!$2) return null; // CLEAR_WRITER_NULL_GUARD');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(target, content, 'utf8');
    patchedFiles += 1;
  }
}

if (matchedFunctions === 0) {
  throw new Error('Paged.js null-guard patch failed: none of the expected DOM helper functions were found.');
}

const missingGuards = [];
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  const content = fs.readFileSync(target, 'utf8');
  for (const functionName of functionNames) {
    const functionPattern = new RegExp(`(?:export\\s+)?function\\s+${functionName}\\s*\\(`);
    const guardPattern = new RegExp(`(?:export\\s+)?function\\s+${functionName}\\s*\\(\\s*[A-Za-z_$][\\w$]*[^)]*\\)\\s*\\{\\s*if \\(![A-Za-z_$][\\w$]*\\) return null; \\/\\/ CLEAR_WRITER_NULL_GUARD`);
    if (functionPattern.test(content) && !guardPattern.test(content)) {
      missingGuards.push(`${path.relative(__dirname, target)}:${functionName}`);
    }
  }
}

if (missingGuards.length > 0) {
  throw new Error(`Paged.js null-guard patch incomplete: ${missingGuards.join(', ')}`);
}

console.log(`Paged.js null guards ready (${patchedFiles} files updated).`);
