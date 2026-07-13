# Clear Writer Documentation

This folder is the starting point for the Clear Writer documentation set.

Clear Writer is a browser/PWA document authoring app for writing Markdown in a CodeMirror editor, rendering a live paginated preview with Paged.js, and exporting documents to PDF. DOCX export is implemented in the source tree, but the active browser runtime intentionally disables it and marks the button unavailable. Projects are organized as Markdown sections plus project-level settings for page layout, typography, lists, tables, metadata, special headings, custom styles, and editor behavior.

## Documentation Map

- [Documentation map](./DOCUMENTATION_MAP.md): detailed outline of the documentation set, feature inventory, source-code mapping, and recommended writing order.
- [Live preview guide](./user/live-preview.md): how the paginated preview and revision-aware preview navigation behave.
- [Preview navigation architecture](./developer/preview-navigation.md): implementation notes for the revision-aware preview navigation pipeline.
- [Technology stack and development model](./developer/technology-stack.md): languages, frameworks, plugins, browser runtime boundaries, storage architecture, and development/test tooling.
- [Exporting and browser PDF print architecture](./user/exporting.md): current PDF/print flow, connected modules, triggers, pagination, hidden iframe printing, telemetry, and validation coverage.

## Current App Areas

- Project workspace: create, open, save, close, organize sections, manage images.
- Markdown editor: CodeMirror-based authoring, formatting commands, search, source styling, autosave, draft recovery.
- Live preview: paginated document preview, heading numbering, table of contents, special headings, image resolution, and revision-aware preview navigation.
- Settings: page setup, typography, lists, tables, TOC, special headings, project metadata, editor preferences, custom inline styles, custom quote/block styles.
- Exports: browser PDF export; DOCX export is implemented but unavailable in the active browser runtime.
- Storage: browser OPFS projects and local directory projects when supported by the browser.
- Runtime: browser/PWA only; there is no Electron or desktop-shell dependency.

## Current Refactor And Cleanup Notes

- Preview navigation is revision-aware and uses an in-memory compiler manifest plus the committed Paged.js DOM. It does not add serialized navigation anchors to exported HTML.
- The project explorer is a compact two-area sidebar for sections and images.
- Release validation is centered on `npm run release:prep`, with focused reruns of browser and PWA smoke checks when diagnosing transient browser timing failures.

## Maintenance Notes

Keep documentation grounded in source files. When behavior changes, update the relevant map entries in `DOCUMENTATION_MAP.md` first, then update the user-facing or developer-facing page that owns the behavior.
