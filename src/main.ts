const params = new URLSearchParams(window.location.search);
type StartupWindow = Window & {
  __CLEAR_WRITER_BOOT_ERROR__?: string;
};

function reportStartupError(error: unknown) {
  const startupWindow = window as StartupWindow;
  startupWindow.__CLEAR_WRITER_BOOT_ERROR__ = error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

if (params.get('export-frame') === 'true') {
  void import('./boot/export-pagination-frame')
    .then(({ bootExportPaginationFrame }) => bootExportPaginationFrame())
    .catch(error => {
      console.error('Clear Writer export frame failed to boot:', error);
      reportStartupError(error);
    });
} else if (params.get('worker') === 'true') {
  void Promise.all([
    import('./boot/worker'),
    import('./platform')
  ])
    .then(([{ bootWorker }, { createWorkerRuntime }]) => {
      const { transport, assetResolver } = createWorkerRuntime();
      bootWorker(transport, assetResolver);
    })
    .catch(error => {
      console.error('Clear Writer worker failed to boot:', error);
      reportStartupError(error);
    });
} else {
  void Promise.all([
    import('./boot/app'),
    import('./platform')
  ])
    .then(([{ bootApp }, { createAppPlatform }]) => {
      void bootApp(createAppPlatform()).catch(error => {
        console.error('Clear Writer app failed during boot:', error);
        reportStartupError(error);
      });
    })
    .catch(error => {
      console.error('Clear Writer app failed to boot:', error);
      reportStartupError(error);
    });
}
