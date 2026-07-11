import path from 'node:path';
import { defineConfig } from 'vite';
import { manualChunks } from './vite.shared';

export default defineConfig({
  base: './',
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
