import path from 'node:path';
import { defineConfig } from 'vite';
import { manualChunks } from './vite.shared';

const buildId = process.env.npm_package_version ? `${process.env.npm_package_version}-${Date.now()}` : `${Date.now()}`;

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
  build: {
    outDir: 'dist-web',
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
