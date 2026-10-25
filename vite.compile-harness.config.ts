import path from 'node:path';
import { defineConfig } from 'vite';
import webConfig from './vite.web.config';

/**
 * Builds the compile-worker integration page with the production worker
 * configuration. The harness is a separate output, so the app build is unchanged.
 */
export default defineConfig({
  ...webConfig,
  build: {
    ...webConfig.build,
    outDir: 'dist-harness',
    rollupOptions: {
      input: { harness: path.resolve('test/fixtures/compile-worker-harness.html') }
    }
  }
});
