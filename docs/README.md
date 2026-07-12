# Clear Writer Documentation

This folder is the starting point for the Clear Writer documentation set.

Clear Writer is a browser/PWA document authoring app for writing Markdown in a CodeMirror editor, rendering a live paginated preview with Paged.js, and exporting documents to PDF. DOCX export is implemented in the source tree, but the active browser runtime intentionally disables it and marks the button unavailable. Projects are organized as Markdown sections plus project-level settings for page layout, typography, lists, tables, metadata, special headings, custom styles, and editor behavior.

## Documentation Map

- [Documentation map](./DOCUMENTATION_MAP.md): detailed outline of the documentation set, feature inventory, source-code mapping, and recommended writing order.
- [Technology stack and development model](./developer/technology-stack.md): languages, frameworks, plugins, browser runtime boundaries, storage architecture, and development/test tooling.
- [Exporting and browser PDF print architecture](./user/exporting.md): current PDF/print flow, connected modules, triggers, pagination, hidden iframe printing, telemetry, and validation coverage.

## Current App Areas

- Project workspace: create, open, save, close, organize sections, manage images.
- Markdown editor: CodeMirror-based authoring, formatting commands, search, source styling, autosave, draft recovery.
- Live preview: paginated document preview, scroll sync, heading numbering, table of contents, special headings, image resolution.
- Settings: page setup, typography, lists, tables, TOC, special headings, project metadata, editor preferences, custom inline styles, custom quote/block styles.
- Exports: browser PDF export; DOCX export is implemented but unavailable in the active browser runtime.
- Storage: browser OPFS projects and local directory projects when supported by the browser.
- Runtime: browser/PWA only; there is no Electron or desktop-shell dependency.

## Maintenance Notes

Keep documentation grounded in source files. When behavior changes, update the relevant map entries in `DOCUMENTATION_MAP.md` first, then update the user-facing or developer-facing page that owns the behavior.
