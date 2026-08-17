# CodeMirror Style Layers

- `surface.css` owns the CodeMirror DOM shell: size, configured font size, background, border, radius, focus, and UI chrome typography. Markdown text remains Courier Prime while search and other CodeMirror controls use the application UI face.
- `extensions/markdown.ts` owns Markdown parsing and CodeMirror's built-in token colors.
- `extensions/markdownAppearance.ts` owns Markdown token preferences only.
- `extensions/editorBehavior.ts` owns one compartment per editor behavior preference.
- `images/resolveEditorImageSource.ts` resolves standalone project images without creating a widget.
- `extensions/imagePreviews.ts` inserts a bounded, non-replacing preview after standalone image syntax.
- `imagePreviews.css` owns the preview thumbnail's size only.

No UI or global stylesheet may target `.cm-*` selectors.
