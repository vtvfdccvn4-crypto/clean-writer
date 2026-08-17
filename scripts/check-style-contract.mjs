import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const cssRoots = [
  path.join(root, 'src', 'style.css'),
  path.join(root, 'src', 'ui', 'styles'),
  path.join(root, 'src', 'editor', 'styles')
];

async function collectCss(entry) {
  const stat = await fs.stat(entry);
  if (stat.isFile()) return [entry];
  const files = await fs.readdir(entry, { withFileTypes: true });
  return files.filter(file => file.isFile() && file.name.endsWith('.css')).map(file => path.join(entry, file.name));
}

const cssFiles = (await Promise.all(cssRoots.map(collectCss))).flat();
const css = (await Promise.all(cssFiles.map(file => fs.readFile(file, 'utf8')))).join('\n');
const legacyPatterns = [
  /--color-[a-z0-9-]+/,
  /\.(?:text-button|icon-button|secondary-button|icon-text-button|toolbar-icon-button|toolbar-text-button|drawer-primary-button|drawer-secondary-button|icon-btn)\b/,
  /material-icons/
];

for (const pattern of legacyPatterns) {
  if (pattern.test(css)) throw new Error(`Legacy style contract remains: ${pattern}`);
}
if (/transition:\s*}/.test(css)) throw new Error('Empty transition declaration found.');
for (const variant of ['.ui-button--icon', '.ui-button--text', '.ui-button--icon-text', '.ui-button--block']) {
  if (!css.includes(variant)) throw new Error(`Missing shared button variant: ${variant}`);
}

const workspace = await fs.readFile(path.join(root, 'src', 'ui', 'styles', 'workspace.css'), 'utf8');
if (/@media[\s\S]*?\.workspace\s*\{[\s\S]*?grid-template-(?:columns|rows|areas)/.test(workspace)) {
  throw new Error('Responsive workspace rules redefine the base grid.');
}

console.log(`Style contract passed (${cssFiles.length} CSS files checked).`);
