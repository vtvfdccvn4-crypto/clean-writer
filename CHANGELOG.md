# Changelog

## Unreleased

### Fixed

- The document outline is keyboard-operable. Its entries are buttons, with one
  in the tab order at a time, and the arrow, Home and End keys move between
  them. Saving re-renders only the sections that changed, and focus and scroll
  position are kept. A heading keeps its focus when its line moves.
- PDF preview now shows its progress in a strip above the export button: the
  current phase, the page count against its estimate, and a Cancel button. The
  page count is announced to screen readers every 25 pages, and when the job
  starts, opens the print dialog, is cancelled, or fails. Before, progress
  appeared only in the button's tooltip, and cancelling required the Escape key.
- Clear Writer asks the browser to keep its storage when a project opens, and
  tells the user when the browser has not agreed. The shell preferences show
  whether storage is protected and how much of the site's quota is used. A
  notice appears at 80% and again at 95%, once each per session.
- A new version of the app no longer takes over an open page. When a new version
  is ready, Clear Writer asks before reloading, saves the open document first,
  and reloads only the tab that accepted. Other open tabs keep running their
  version, and their files are kept until the next update. The worker now
  precaches every file in the build as one set, so the app opens offline after
  its first visit. Offline reloads use only the current version's files.
- Live preview follows typing after a 250 ms pause, instead of waiting for the
  750 ms autosave. The save status reports "saving" only while a save runs, and
  reports "saved" only when the save covers the newest edit. The paginated
  preview keeps its 750 ms pause.
- Typing in a large document no longer copies the whole document or rescans
  every line on each keystroke. Custom-style highlighting covers only the
  visible lines, and table decorations are mapped through each edit and only
  the surrounding blank-line-bounded region is re-parsed. Autosave and draft
  writes read the text once, when they run. In the 1,000-page benchmark (headless
  Chromium, one machine), 200 keystrokes went from a median dispatch of 11 ms
  and a p95 of about 37 ms, with 2 to 7 long tasks, to a median of 4.5 ms, a p95
  of 6 to 12 ms, and no long tasks.
- Recovery drafts are stored in IndexedDB, one record per section, instead of
  whole-document JSON in localStorage. Writes are debounced (1 second, at most
  5 seconds while typing) and each record carries a content hash, so a damaged
  draft is reported rather than restored. A failed write is retried and shown
  in a notice. Drafts from the older localStorage format are migrated once.
  Pruning removes drafts for deleted sections, drafts older than 30 days, and
  the oldest drafts above 200 MB.
- PDF preview pagination no longer stops at a fixed 300 seconds. A job is
  stopped when it completes no new page for 60 seconds (120 seconds when it has
  images), or when it runs past a 45-minute ceiling. A job that keeps producing
  pages is not stopped at the stall limit. The stall and ceiling values are
  provisional until they are calibrated on real documents.
- Cancelling PDF preview pagination now discards the pagination frame. Before,
  the promise resolved as cancelled while Paged.js kept laying out in the old
  frame, and the next job could start in the same staging DOM.
- The pagination frame removes each run's Paged.js styles and page DOM after
  its artifact is serialized. Before, identical repeated runs grew the frame's
  page CSS, and a later page size inherited the earlier page rule.
- Edits typed in the moment before closing a project, or before a selection
  change that ran ahead of the editor flush, are now saved. Previously the save
  was skipped once the document was no longer open, leaving the text only in
  draft recovery and triggering an "Unsaved Draft Found" prompt on reopen.
- Closing a project now releases the hidden pagination frame instead of keeping
  it loaded until the app closes.
- Creating the first section no longer saves a stray `sections` entry in the
  project's section order.
- Live preview recompiles every block after custom styles, block styles,
  special headings, or metadata change, instead of keeping old styling on
  unchanged blocks.
- All generated HTML (outline, toolbar buttons, print documents) escapes single
  quotes as well as double quotes, as the open-project dialog already did.

### Changed

- The outline panel re-reads only the section that was saved instead of every
  section in the project.
- Internal restructuring with no intended behaviour change: preview objects are
  built by `PreviewPipeline`; the compiler and export take their settings as
  inputs instead of reading application state; project services accept an
  injected state; the in-memory workspace shares the real workspace code; and
  shared types are split by area under `src/types/`.
- The application shell restyle: image previews use the table card treatment
  with a single alignment toggle, and the activity rail is 48 px.

### Testing

- All 19 browser smoke fixtures pass, and CI runs them before every deploy.
  Four fixtures that had been failing were fixed, one of which exposed the
  autosave issue above.
- `src` no longer contains `as any` casts or `any`-typed parameters.

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
