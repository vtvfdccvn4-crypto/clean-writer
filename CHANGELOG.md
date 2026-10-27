# Changelog

## Unreleased

### Added

- Project backup and restore. Download backup in the project toolbar saves the
  whole project as one ZIP: sections, project settings and order, page-break,
  header, footer, numbering and page-setup settings, images and assets. In Open
  project, Import a backup restores a ZIP as a new project in browser storage
  (named "... (imported)" if the name is taken). The ZIP is checked in full
  before anything is created, and a failed import leaves no project behind.
  Neither needs local-folder access. The trash is not included. Limits are stated
  in the app: a project over 300 MB cannot be backed up and a ZIP over 200 MB is not
  imported. ZIP64 archives, files that are not backups, a full browser store and
  running out of memory each get their own message, and a failed import leaves no
  project behind. An import checks free browser storage before creating anything.

### Changed

- A recovery draft is now written at least every second while typing (before:
  every 5 s). Sections above 200,000 characters wait longer, up to 5 s; the app
  says so once when such a section is edited, and the Download backup tooltip states both windows.
- Local-folder projects are recorded as future development, not planned now.

### Fixed (drafts)

- After a save, a recovery draft written for text typed before the save is now
  deleted. Before, it could outlive the save and the app asked to restore an
  older draft after a reload.

### Fixed

- Deleted sections can now be restored or deleted for good. A Trash button in the
  explorer toolbar opens a list of deleted sections and folders, with where each
  one was and when it was deleted. Restore puts a section back in its place in the
  project order with its page-break, header, footer, numbering and table-of-contents
  settings. If its name has been taken, it comes back as "name (restored)" and
  nothing is overwritten. Delete forever and Empty trash ask for confirmation.
  The explorer's delete confirmation now says the section moves to the trash.
- A restored recovery draft is now saved. Before, the status said "Saved" while the
  restored text was only in the editor, and the same draft was offered again after a
  reload until the text was edited. The restored draft is applied as an edit, so
  autosave writes it, and the status says "Unsaved changes" until it has. A notice
  confirms the restore.
- The preview no longer jumps back to the top after a render if the reader has
  scrolled. The render's final scroll to the top, the scroll restore on the next
  frame, and the cursor sync that follows opening a document all yield to a reader
  who has moved the preview.
- The save and storage messages no longer point to local folders or reconnecting a
  folder, which the MVP does not offer. A full browser store is named as the reason
  a save failed, and the message says the text is still open.

- The preview footer has previous and next heading buttons, and a page field in
  the paginated preview. Typing a page number moves to that page. A number outside
  the document is refused and announced. Each move is announced once through a
  status region.
- Animations and transitions finish at once for people who have asked for reduced
  motion, across the app. Before, only preview scrolling respected the setting.
- Deleting a section or folder moves it to the project's `.trash` folder instead
  of removing it, so the deletion can be undone from the Trash dialog. The trash
  is not shown in the explorer, and it is not emptied automatically.
- Saving checks whether the section's file changed outside Clear Writer since the
  app last read or wrote it. If it did, the save is skipped, the file is left as
  it is, and a notice says the edit is kept in recovery. Before, the file was
  overwritten silently.
- A failed file write is aborted, so the previous contents are kept. Before, the
  stream was left open.
- Web links in a document open in a new window without access to the app. Before,
  clicking one in the preview navigated the app away from the document.
- Printing waits until each image has been decoded, not only until it has
  arrived, so a large image is drawn before the print dialog opens.
- Full-document and single-document compiles can run in a background worker,
  enabled with `?compile-worker=true`. It is off by default. In a 1,000-page
  test, the page's main thread went from one 6 s task to no long tasks, and its
  longest frame gap went from about 6 s to 17 ms. The live preview still
  compiles on the page.
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
- Live preview renders from a full compile of the whole section on every
  update. The earlier incremental path compiled each block alone, so a reference
  or footnote defined in another block showed as raw text, and an unclosed code
  fence could absorb the section's closing markup. In a differential test, the
  incremental output differed from the full compile in 118 of 150 edits on a
  300-page section, and it was slower than the full compile there (817 ms against
  287 ms per update, headless Chromium).
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

- Local-folder projects are hidden in the new-project and open-project dialogs.
  Browser-managed projects are the supported storage. `?local-folders=true` shows
  the folder options for development. See `docs/developer/mvp-scope.md`.
- Dependencies: Vite is upgraded to 8.2.4, which clears the three high-severity
  `npm audit` findings (in Vite, nanoid and source-map-js). They were in
  development and build tooling, not in the production bundle.
- Safari compiles a document of 400,000 to 700,000 characters in a background
  worker by default. A compile at that size used to hold the page's main thread
  for 1.5 to 2.8 s, which froze the editor while the preview compiled. Now the
  editor stays responsive during the compile. Smaller documents, and documents
  above 700,000 characters, compile on the page as before. `?compile-worker=false` keeps every compile on the page, and
  `?compile-worker=true` uses the worker for any document in any browser.
  Chromium and other browsers are unchanged until their own evidence passes.
  This evidence comes from Playwright's WebKit in CI, on Linux, not from
  physical Safari hardware.
- Live preview freshness. While edits arrive faster than the preview can
  compile, the preview's status line reads "Preview paused while typing; showing
  last completed revision." When the pause ends and the newest text is
  compiling, it reads "Preview updating". The line clears when the newest
  revision has rendered. A line is shown only after 400 ms, so a refresh that
  finishes quickly does not flash it.
- Interim render target for the 400,000 to 700,000 character range: the deferred
  preview render, after the pause, is measured at 100 ms or less at the 95th
  percentile. This is a temporary exception to the original 50 ms target, which
  block-level rendering (plan item B13) will restore for large documents. Typing
  is not part of this allowance. The keystroke path is measured separately.
- Safari's new-project dialog offers browser storage, and does not offer a local
  folder, because Safari has no File System Access API. Local-folder projects
  remain unsupported in Safari.
- The compile worker keeps only the latest completed live revision, so editing
  does not accumulate rendered documents in memory. Full-document and export
  work keeps a bounded set of four recent results within 16 million characters.

- A large document (more than 400,000 characters, about 85 printed pages) opens
  in the live preview. Its print preview is built when you ask for it, with the
  Build print preview button, and an edit marks it out of date instead of
  re-paginating it. Page-break guides are not drawn for large documents. Smaller
  documents open in the print preview as before. The threshold is set from the
  Phase 0 baseline and is provisional.
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
