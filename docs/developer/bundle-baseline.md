# Web bundle baseline

Baseline captured on 2026-07-28 from `npm run build` using the web production configuration.

The initial application chunk is `521,353` bytes raw and `147,684` bytes gzip-compressed. It is currently below the Phase 1 guardrail of `550 KiB`, but above the long-term target of `500 KiB` raw. The largest deferred chunks are Paged.js content (`384,860` bytes raw) and CodeMirror autocomplete (`325,984` bytes raw).

## Current loading boundaries

- `src/main.ts` loads the application entry and platform through dynamic imports.
- `src/boot/app.ts` statically loads the editor manager, preview setup, settings, writing tools, task-panel features, and application shell.
- Paged.js and CodeMirror packages are already split through `vite.shared.ts` manual chunk rules.
- PDF preview frame boot has a separate dynamic entry at `src/boot/pdf-preview-frame.ts`.
- The next refactor should move PDF-preview setup, editor initialization, and low-frequency settings/tools behind feature-level dynamic imports.

## Reproducing the baseline

```powershell
npm run build
npm run check:bundle
```

`check:bundle` writes the complete raw/gzip chunk inventory to `tmp/bundle-baseline.json` and enforces the 500 KiB initial-chunk budget. CI can set `CLEAR_WRITER_BUNDLE_REPORT` to publish the report as an artifact.

## Current feature boundaries

- The initial application chunk contains the shell, platform bootstrap, task navigation, and lightweight workflow wiring.
- `editor-manager-*.js` contains the editor and CodeMirror orchestration.
- `setupSettingsFeatures-*.js` contains settings drawer implementations.
- `setupWritingTools-*.js` contains outline, project search, and project review tools.
- `setupPdfPreview-*.js` and `IsolatedPdfPreviewPipeline-*.js` contain PDF export setup and execution.
- Paged.js and CodeMirror vendor modules remain independently cacheable.

No additional manual source chunks are currently forced in `vite.shared.ts`; Vite's dynamic-import boundaries produce more useful feature chunks without duplicating shared modules.
