async function createTestServer(options = {}) {
  const { createServer } = await import('vite');
  const { optimizeDeps, server, ...rest } = options;
  return createServer({
    appType: 'custom',
    ...rest,
    optimizeDeps: { noDiscovery: true, ...(optimizeDeps || {}) },
    server: { middlewareMode: true, hmr: false, ws: false, ...(server || {}) }
  });
}

module.exports = { createTestServer };
