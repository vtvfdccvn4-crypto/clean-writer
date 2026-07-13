# Live Preview

Clear Writer's preview panel renders the document as paginated pages and keeps the editor and preview aligned through revision-aware preview navigation without adding tracking attributes to the HTML.

## What The Preview Does

- Renders the current Markdown as paginated pages through Paged.js.
- Applies document settings such as paper size, margins, headers, footers, typography, lists, tables, heading numbering, TOC, and special headings.
- Resolves images through the active workspace or browser storage.
- Supports both full-document preview and single-section preview while editing a section.

## How Source-to-Preview Navigation Works

When you click or move the selection inside the CodeMirror editor, the app reads the current line number from the active editor state and asks the preview to reveal the corresponding content.

The preview uses a committed preview index built from the same compilation pass that produced the HTML:

1. The editor emits selection-only updates, not general typing events.
2. The editor manager records the current document revision and passes it to the preview.
3. The compiler creates an in-memory manifest of source blocks while generating HTML.
4. The preview renderer sends that manifest into the exact pagination pass.
5. After Paged.js finishes, the renderer builds a committed index from the final page DOM using Paged.js's own transient references.
6. The navigation coordinator only reveals a target when the committed preview revision matches the editor revision that requested it.
7. The preview viewport scrolls the selected block near the top with a small inset, so the selection is visible without forcing a centered jump.

That design keeps the HTML output clean and makes navigation resilient to rerenders, page splits, and image-induced pagination changes.

## How It Was Implemented

- `src/editor/createEditor.ts` only calls the selection callback when the selection changes and the document text has not changed.
- `src/ui/editor-manager.ts` passes the current editor revision into the preview navigation path.
- `src/compiler/index.ts` compiles the document and returns both HTML and an in-memory manifest describing source ranges.
- `src/preview/RenderEngine.ts` forwards that manifest into the committed preview pass after Paged.js completes.
- `src/preview/navigation/CommittedPreviewIndex.ts` maps the compiler manifest to the committed page DOM using Paged.js references such as `data-ref` and `data-split-from`.
- `src/preview/navigation/PreviewNavigationCoordinator.ts` queues or discards requests until the preview revision and editor revision match.
- `src/preview/PreviewViewport.ts` positions the target block near the top of the viewport instead of centering it.

## Practical Result

The preview follows the editor selection based on the committed document state. That keeps navigation stable after images, page breaks, and rerenders, and it keeps the document HTML clean for export and diagnostics.
