import { bootPdfRendererFrame } from '../src/frame-runtime';

// Add application-specific prepareSource/finalizePages hooks here. This file is
// bundled into renderer.html and is never imported by the host application.
bootPdfRendererFrame();
