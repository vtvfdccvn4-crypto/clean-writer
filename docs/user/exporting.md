# PDF Preview Architecture

Clear Writer currently has one PDF entry point: **PDF Preview**. It is an
isolated browser-print workflow, not a direct PDF file writer. The browser
print dialog is responsible for saving a PDF or sending it to a printer.

The route is intentionally still being hardened before it is considered the
production PDF workflow.

## Current flow

1. The Preview panel invokes `setupPdfPreview`.
2. `EditorManager` flushes and compiles the durable document snapshot, then
   captures the print stylesheet, header/footer data, and resolved margin
   image URLs.
3. `IsolatedPdfPreviewPipeline` opens a print target during the click gesture
   and creates a separate same-origin pagination iframe.
4. `?pdf-preview=true` runs Paged.js directly in that iframe.
5. The frame materialises headers and footers into the completed page tree and
   returns the paginated artifact to the print target.
6. The print target waits for images and invokes the browser print API.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/boot/setupPdfPreview.ts` | PDF Preview button state and invocation. |
| `src/ui/editor-manager.ts` | Durable source snapshot and frozen print input. |
| `src/pdf-preview/IsolatedPdfPreviewPipeline.ts` | Parent-side print target and frame messaging. |
| `src/boot/pdf-preview-frame.ts` | Isolated Paged.js execution route. |
| `src/pdf-preview/PdfPreviewMarginRenderer.ts` | Header/footer materialisation. |
| `src/pdf-preview/PdfPreviewPageGuidePaginator.ts` | Isolated pagination used by editor page-break guides through the shared editor host. |
| `src/pdf-preview/IsolatedPaginationHost.ts` | Cancellable, size-aware iframe lifecycle and pagination protocol. |
| `src/print/PrintDocumentCompiler.ts` | Print-document semantics and page-break markers. |
| `src/print/PrintCssCompiler.ts` | Frozen print layout stylesheet. |

## Current limitations

- The workflow presently uses a visible print target window.
- Cancellation, adaptive budgets, artifact validation, persistent diagnostics,
  and large-document browser regression gates are pending before promotion.
