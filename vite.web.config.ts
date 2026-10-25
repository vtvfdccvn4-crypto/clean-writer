import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { manualChunks } from './vite.shared';

const buildId = process.env.npm_package_version ? `${process.env.npm_package_version}-${Date.now()}` : `${Date.now()}`;
const OUT_DIR = 'dist-web';
const SERVICE_WORKER_FILE = 'sw.js';
const BUILD_ASSETS_MARKER = '/*__CLEAR_WRITER_BUILD_ASSETS__*/ []';
const BUILD_ID_MARKER = '__CLEAR_WRITER_SW_BUILD_ID__';

function listFiles(directory: string, prefix = ''): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFiles(path.join(directory, entry.name), relative)
      : [relative];
  });
}

/**
 * Writes the list of every built file into the service worker, so the worker
 * precaches exactly what this build serves. The build fails if the marker is
 * missing, since a worker without its list would precache only the shell.
 */
function serviceWorkerBuild(id: string): Plugin {
  return {
    name: 'clear-writer-service-worker-build',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(OUT_DIR);
      const workerPath = path.join(outDir, SERVICE_WORKER_FILE);
      let source = fs.readFileSync(workerPath, 'utf8');
      if (!source.includes(BUILD_ASSETS_MARKER) || !source.includes(BUILD_ID_MARKER)) {
        throw new Error('The service worker is missing its build markers (asset list and build id).');
      }
      const assets = listFiles(outDir)
        .filter(file => file !== SERVICE_WORKER_FILE)
        .sort();
      source = source.replace(BUILD_ASSETS_MARKER, JSON.stringify(assets));
      source = source.replace(BUILD_ID_MARKER, id);
      fs.writeFileSync(workerPath, source);
    }
  };
}

export default defineConfig({
  base: './',
  define: {
    __CLEAR_WRITER_BUILD_ID__: JSON.stringify(buildId)
  },
  server: {
    port: 5274
  },
  preview: {
    port: 5274,
    strictPort: true
  },
  plugins: [serviceWorkerBuild(buildId)],
  build: {
    outDir: OUT_DIR,
    rollupOptions: {
      input: {
        index: path.resolve('index.html')
      },
      output: {
        manualChunks
      }
    }
  }
});
