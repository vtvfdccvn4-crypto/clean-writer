export function splitVendorPackage(id: string, packages: string[]): string | null {
  for (const packageName of packages) {
    if (id.includes(`node_modules/${packageName}/`)) {
      return packageName
        .replace(/^@/, '')
        .replace(/\//g, '-');
    }
  }
  return null;
}

export function manualChunks(id: string): string | undefined {
  const normalized = id.replaceAll('\\', '/');

  if (normalized.includes('node_modules/pagedjs/')) {
    if (normalized.includes('/chunker/')) return 'pagedjs-chunker';
    if (normalized.includes('/polisher/')) return 'pagedjs-polisher';
    if (normalized.includes('/polyfill/')) return 'pagedjs-polyfill';
    if (normalized.includes('/utils/')) return 'pagedjs-utils';
    if (normalized.includes('/modules/paged-media/')) return 'pagedjs-media';
    if (normalized.includes('/modules/generated-content/')) return 'pagedjs-content';
    if (normalized.includes('/modules/filters/')) return 'pagedjs-filters';
    if (normalized.includes('/modules/')) return 'pagedjs-modules';
    return 'pagedjs-core';
  }

  const codemirrorPackage = splitVendorPackage(normalized, [
    '@codemirror/autocomplete',
    '@codemirror/commands',
    '@codemirror/lang-css',
    '@codemirror/lang-html',
    '@codemirror/lang-javascript',
    '@codemirror/lang-markdown',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    '@lezer/markdown'
  ]);
  if (codemirrorPackage) return codemirrorPackage;
  if (normalized.includes('node_modules/codemirror/')) return 'codemirror-bridge';

  return undefined;
}
