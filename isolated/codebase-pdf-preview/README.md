# Codebase PDF Preview

This isolated TypeScript package turns plain repository text into a safe HTML/CSS source, paginates it once in a disposable Paged.js frame, and returns an immutable page artifact that can be mounted for preview or installed in a browser print target.

It is intentionally disconnected from the Clear Writer application. Nothing here imports the repository's `src/` tree, and the application does not import this package.

## What it produces

The package produces a validated `PdfArtifact`: serialized physical-page HTML, the source and Paged.js styles required to display those pages, a compact SHA-256 render identity, and one-based page metadata. It does not encode PDF bytes. `PdfPrintTarget` opens the browser print dialog, where the user can save those exact pages as PDF.

## Quick start

Bundle `examples/renderer.html` as an addressable page, then:

```ts
import { PdfPreviewPipeline, PdfPrintTarget } from '@clear-writer/codebase-pdf-preview';

const pipeline = new PdfPreviewPipeline({
  frameUrl: new URL('./renderer.html', import.meta.url)
});

const target = PdfPrintTarget.open({ title: 'Repository source' });
if (!target) throw new Error('The browser blocked the PDF preview window.');

const job = await pipeline.createTextJob({
  title: 'Repository source',
  files: [
    { path: 'src/example.ts', language: 'TypeScript', text: 'export const answer = 42;\n' }
  ]
});

const outcome = await pipeline.renderAndPrint(job, target);
if (outcome.status !== 'success' && outcome.status !== 'cancelled') {
  throw new Error(outcome.message);
}
```

Open the print target synchronously inside the user's click handler. Browser popup activation normally expires before asynchronous compilation or pagination finishes.

## Commands

```sh
npm --prefix isolated/codebase-pdf-preview run typecheck
npm --prefix isolated/codebase-pdf-preview test
# With Vite serving the repository at http://127.0.0.1:5275:
npm --prefix isolated/codebase-pdf-preview run test:browser
```

## Trust boundary

`compileTextBundle()` escapes file paths, labels, titles, and every source line, so arbitrary source text cannot become markup. The lower-level `createPdfRenderJob()` accepts trusted HTML; sanitize raw HTML before calling it.

## Operational invariants

1. Capture all source and layout inputs before creating the job.
2. Include renderer-extension configuration in `extensionIdentity`.
3. Paginate once in the disposable frame.
4. Perform only no-reflow finalization after pagination.
5. Validate and freeze the transferred artifact again in the parent.
6. Preview and print the artifact without repagination.

See [ANALYSIS.md](./ANALYSIS.md) for the extraction audit and design decisions.
