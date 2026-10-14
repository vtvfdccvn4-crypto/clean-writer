# Live Preview

Clear Writer's preview panel renders the document as paginated pages and keeps the editor and preview aligned through revision-aware preview navigation without adding tracking attributes to the HTML.

## What The Preview Does

- Renders the current Markdown through two presentation lanes: a continuous incremental live renderer for authoring and an isolated Paged.js paginator for physical-page preview.
- Applies document settings such as paper size, margins, headers, footers, typography, lists, tables, heading numbering, TOC, and special headings.
- Resolves images through the active workspace or browser storage.
- Supports both full-document preview and single-section preview while editing a section.

## How Source-to-Preview Navigation Works

When you click or move the selection inside the CodeMirror editor, the app reads the current line number from the active editor state and asks the preview to reveal the corresponding content.

The preview uses a committed preview index built from the same compilation pass that produced the HTML:

1. The editor emits selection-only updates, not general typing events.
2. The editor manager records the current document revision and passes it to the preview.
3. The compiler creates an in-memory manifest of source blocks while generating HTML.
4. In continuous mode, the incremental renderer reconciles the latest compiled blocks without running Paged.js.
5. In paginated mode, `PreviewController` creates an immutable print job containing the compiled HTML, print CSS, margins, and resolved assets.
6. `IsolatedPaginationHost` paginates that job in a disposable iframe and returns the completed artifact with diagnostics.
7. After a paginated artifact is committed, the preview builds an index from the final page DOM using Paged.js's own transient references.
8. The navigation coordinator only reveals a target when the committed preview revision matches the editor revision that requested it.
9. The preview viewport scrolls the selected block near the top with a small inset, so the selection is visible without forcing a centered jump.

That design keeps the HTML output clean and makes navigation resilient to rerenders, page splits, and image-induced pagination changes.

## How It Was Implemented

- `src/editor/createEditor.ts` only calls the selection callback when the selection changes and the document text has not changed.
- `src/ui/editor-manager.ts` passes the current editor revision into the preview navigation path.
- `src/compiler/index.ts` compiles the document and returns both HTML and an in-memory manifest describing source ranges.
- `src/preview/PreviewController.ts` schedules isolated renders and commits only the newest completed artifact.
- `src/pdf-preview/IsolatedPaginationHost.ts` owns iframe creation, cancellation, size-aware timeout budgets, progress, diagnostics, and cleanup.
- `src/pdf-preview/PdfPreviewJobFactory.ts` creates the immutable print job consumed by the isolated host.
- `src/preview/navigation/CommittedPreviewIndex.ts` maps the compiler manifest to the committed page DOM using Paged.js references such as `data-ref` and `data-split-from`.
- `src/preview/navigation/PreviewNavigationCoordinator.ts` queues or discards requests until the preview revision and editor revision match.
- `src/preview/PreviewViewport.ts` positions the target block near the top of the viewport instead of centering it.

## Practical Result

The preview follows the editor selection based on the committed document state. That keeps navigation stable after images, page breaks, and rerenders, and it keeps the document HTML clean for export and diagnostics.
