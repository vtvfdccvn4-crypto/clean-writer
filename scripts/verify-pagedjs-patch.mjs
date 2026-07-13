import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(root);
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const declaredVersion = packageJson.dependencies?.pagedjs;
if (!/^\d+\.\d+\.\d+$/.test(declaredVersion || '')) {
  throw new Error(`Paged.js must be pinned to an exact version; found ${declaredVersion || 'missing'}.`);
}

const patchName = `pagedjs+${declaredVersion}.patch`;
const patchPath = path.join(projectRoot, 'patches', patchName);
if (!fs.existsSync(patchPath)) throw new Error(`Missing committed Paged.js patch: patches/${patchName}`);

const targets = [
  ['dist/paged.js', ['nodeAfter', 'nodeBefore', 'findElement', 'previousSignificantNode', 'nextSignificantNode']],
  ['dist/paged.polyfill.js', ['nodeAfter', 'nodeBefore', 'findElement', 'previousSignificantNode', 'nextSignificantNode']],
  ['lib/utils/dom.cjs', ['nodeAfter', 'nodeBefore', 'findElement', 'previousSignificantNode', 'nextSignificantNode']],
  ['src/utils/dom.js', ['nodeAfter', 'nodeBefore', 'findElement', 'previousSignificantNode', 'nextSignificantNode']]
];

for (const [relativePath, functions] of targets) {
  const filePath = path.join(projectRoot, 'node_modules', 'pagedjs', relativePath);
  const content = fs.readFileSync(filePath, 'utf8');
  for (const functionName of functions) {
    const functionPattern = new RegExp(`(?:export\\s+)?function\\s+${functionName}\\s*\\(\\s*([A-Za-z_$][\\w$]*)`);
    const match = content.match(functionPattern);
    if (!match) throw new Error(`Paged.js helper missing: ${relativePath}:${functionName}`);
    const start = match.index + match[0].length;
    const bodyPrefix = content.slice(start, start + 160);
    if (!new RegExp(`\\{\\s*if \\(!${match[1]}\\) return null; \/\/ CLEAR_WRITER_NULL_GUARD`).test(bodyPrefix)) {
      throw new Error(`Paged.js null guard missing: ${relativePath}:${functionName}`);
    }
  }
}

console.log(`Paged.js ${declaredVersion} patch verified (${patchName}).`);
