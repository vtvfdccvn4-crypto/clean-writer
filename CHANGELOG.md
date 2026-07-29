# Changelog

## 0.1.0-rc.1 — 2026-07-29

First release candidate for Clear Writer's browser/PWA edition.

### Included

- Markdown authoring with project sections, folders, images, autosave, recovery,
  browser-backed projects, and supported local-directory projects.
- Live paginated preview with source navigation, document styling, heading
  numbering, lists, tables, and table of contents support.
- Isolated PDF preview and browser-print workflow with page setup,
  headers/footers, margins, and pagination diagnostics.
- PWA shell with versioned service-worker caches and relative-path deployment.

### Changed

- Replaced the legacy project sidebar with the task-panel workflow.
- Replaced the former browser export pipeline with isolated PDF preview and
  pagination modules.
- Added bundle, PDF-scale, browser-smoke, and production-shell release gates.

### Not included

- DOCX import or export.
- Cloud sync, collaboration, or account-based project storage.

See [the release-candidate scope](docs/developer/release-candidate-scope.md) for
the complete inclusion and removal decisions.
