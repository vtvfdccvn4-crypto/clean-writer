# CodeMirror Style Layers

- `surface.css` owns the CodeMirror DOM shell: size, configured font size, background, border, radius, focus, and UI chrome typography. Markdown text remains Courier Prime while search and other CodeMirror controls use the application UI face.
- `extensions/markdown.ts` owns Markdown parsing and CodeMirror's built-in token colors.
- `extensions/markdownAppearance.ts` owns Markdown token preferences only.
- `extensions/editorBehavior.ts` owns one compartment per editor behavior preference.
- Image sources are resolved by the editor's caller through the `resolveImageSource` callback (supplied by `DocumentRenderCoordinator`); the editor has no resolver of its own.
- `extensions/imagePreviews.ts` inserts a bounded, non-replacing preview after standalone image syntax.
- `extensions/tableHelpers.ts` inserts a non-replacing column and row builder above Markdown tables.
- `imagePreviews.css` owns the image preview card (the same card treatment as the table helper) and the thumbnail's size.
- `tableHelpers.css` owns the table helper's control block and the table row backdrop only.

No UI or global stylesheet may target `.cm-*` selectors.
