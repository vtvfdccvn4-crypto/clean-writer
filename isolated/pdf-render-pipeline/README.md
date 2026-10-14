# Isolated PDF Render Pipeline

A browser-side TypeScript component that converts trusted HTML and CSS into an immutable, paginated Paged.js artifact, then optionally installs that exact artifact in a print window.

This folder is intentionally disconnected from the Clear Writer application. Nothing under `src/` imports from the repository's `src/` tree, and the application does not import this package. Copy this directory into another implementation or publish it after choosing a package name and build output.

## Quick start

1. Install `pagedjs@0.4.3` and TypeScript tooling.
2. Bundle `examples/renderer.html` as an independently addressable page.
3. Create a `PdfRenderPipeline` with that page's URL.
4. Convert already-sanitized, asset-resolved HTML/CSS with `createPdfRenderJob()`.
5. Call `paginate()` for an artifact, or open `PdfPrintTarget` synchronously and call `paginateAndPrint()`.

See [PIPELINE.md](./PIPELINE.md) for the architecture, contracts, migration guide, review findings, and operational details.

## Commands

```sh
npm run typecheck
npm test
```

## Trust boundary

The package assigns job and artifact HTML through `innerHTML`. Treat it as trusted compiler output. Sanitize user-authored raw HTML before this boundary, and resolve relative asset URLs to absolute or blob URLs before sending a job into the renderer frame.
