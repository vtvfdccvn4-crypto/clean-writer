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

if (params.get('pdf-preview') === 'true') {
  void import('./boot/pdf-preview-frame')
    .then(({ bootPdfPreviewFrame }) => bootPdfPreviewFrame())
    .catch(error => {
      console.error('Clear Writer PDF preview frame failed to boot:', error);
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
