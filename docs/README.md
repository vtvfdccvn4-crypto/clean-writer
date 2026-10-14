# Clear Writer Documentation

This folder is the starting point for the Clear Writer documentation set.

Clear Writer is a browser/PWA document authoring app for writing Markdown in a CodeMirror editor, rendering a live paginated preview with Paged.js, and preparing PDF previews through the browser print dialog. Projects are organized as Markdown sections plus project-level settings for page layout, typography, lists, tables, metadata, special headings, custom styles, and editor behavior.

## Documentation Map

- [Documentation map](./DOCUMENTATION_MAP.md): detailed outline of the documentation set, feature inventory, source-code mapping, and recommended writing order.
- [Live preview guide](./user/live-preview.md): how the paginated preview and revision-aware preview navigation behave.
- [Preview navigation architecture](./developer/preview-navigation.md): implementation notes for the revision-aware preview navigation pipeline.
- [Current-state handoff](./developer/current-state-handoff.md): verified baseline, active refactor boundaries, and the safest next steps for another agent.
- [Technology stack and development model](./developer/technology-stack.md): languages, frameworks, plugins, browser runtime boundaries, storage architecture, and development/test tooling.
- [PDF Preview architecture](./user/exporting.md): current isolated PDF/print flow, connected modules, pagination, and promotion limitations.
- [First release candidate scope](./developer/release-candidate-scope.md): included features, intentional removals, and approval boundary.
- [GitHub Pages deployment](./developer/deployment.md): staging and production deployment procedure.
- [Privacy and local data](./user/privacy.md): what the web application stores and transmits.

## Current App Areas

- Project workspace: create, open, save, close, organize sections, manage images.
- Markdown editor: CodeMirror-based authoring, formatting commands, search, source styling, autosave, draft recovery.
- Live preview: paginated document preview, heading numbering, table of contents, special headings, image resolution, and revision-aware preview navigation.
- Live preview also has a continuous incremental-render lane for authoring; physical pagination is isolated and cancellable.
- Settings: page setup, typography, lists, tables, TOC, special headings, project metadata, editor preferences, custom inline styles, custom quote/block styles.
- PDF Preview: browser print workflow.
- Storage: browser OPFS projects and local directory projects when supported by the browser.
- Runtime: browser/PWA only; there is no Electron or desktop-shell dependency.

## Current Codebase Notes

- Preview navigation is revision-aware and uses an in-memory compiler manifest plus the committed Paged.js DOM. It does not add serialized navigation anchors to exported HTML.
- The shell is organized around three explicit panel regions: `project-panel`, `task-panel`, and `shared-panel`.
- Shared app defaults live in `src/ui/styles/global-defaults.css`; shell-specific styling lives in the focused stylesheets under `src/ui/styles/`.
- The task panel has its own header/content/footer shell, and the shared panel owns the editor/preview split.
- Project actions are implemented by `src/ui/task-panel-actions.ts`, with section and image interactions in `src/ui/task-explorer.ts` and `src/ui/task-images.ts`.
- The former `src/ui/sidebar/` and `src/ui/workspace-layout.ts` modules are no longer part of the active tree; do not reintroduce them as documentation or implementation entry points.
- Release validation is centered on `npm run release:prep`, with focused reruns of browser and PWA smoke checks when diagnosing transient browser timing failures.
- `npm run check:styles` enforces the shared UI button/token contract.

The documentation map includes planned guide pages that have not been created yet. Existing pages are listed under Documentation Map above; entries labeled “Planned file (not currently present)” are planning targets, not current files.

## Maintenance Notes

Keep documentation grounded in source files. When behavior changes, update the relevant map entries in `DOCUMENTATION_MAP.md` first, then update the user-facing or developer-facing page that owns the behavior.
