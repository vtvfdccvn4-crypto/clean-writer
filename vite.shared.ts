import path from 'node:path';
import type { Plugin } from 'vite';

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

/**
 * decode-named-character-reference ships a DOM variant selected by the browser
 * condition. That variant calls document.createElement when it loads, which
 * crashes inside a worker. Worker bundles resolve the package's plain entry
 * instead. Only the worker bundles use this plugin, so the page keeps the
 * browser variant.
 */
export function workerDomFreeResolution(): Plugin {
  const plainEntry = path.resolve('node_modules/decode-named-character-reference/index.js');
  return {
    name: 'clear-writer-worker-dom-free-resolution',
    enforce: 'pre',
    resolveId(source) {
      return source === 'decode-named-character-reference' ? plainEntry : null;
    }
  };
}

/**
 * Dev-server dependency pre-bundling resolves packages with the browser condition,
 * which inlines the DOM variant of decode-named-character-reference into bundles
 * that the worker also loads. This points the pre-bundler at the plain entry too.
 */
export function plainCharacterReferenceEsbuildPlugin(): { name: string; setup(build: { onResolve(options: { filter: RegExp }, callback: () => { path: string }): void }): void } {
  const plainEntry = path.resolve('node_modules/decode-named-character-reference/index.js');
  return {
    name: 'clear-writer-plain-character-reference',
    setup(build) {
      build.onResolve({ filter: /^decode-named-character-reference$/ }, () => ({ path: plainEntry }));
    }
  };
}
