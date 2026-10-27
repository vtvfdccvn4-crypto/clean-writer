# MVP Scope

The working MVP is deliberately narrow. It is meant to be relied on for real
writing in one setup, and the large-document work continues alongside it.

## Supported

- **Browser:** desktop Chromium.
- **Storage:** browser-managed projects (stored in the browser's private file
  system).
- **Workflow:** Markdown editing, live preview, the paginated preview, and PDF
  export through the browser's print dialog ("Save as PDF").
- **Backup and restore:** Download backup saves the whole project as one ZIP
  (sections, settings and order, images, assets). Open project > Import a
  backup restores it as a new project. Neither needs local-folder access.
- **Documents:** ordinary documents. Very large documents are experimental.

## Not in the MVP

- **Future development: local-folder projects.** Not planned for now. The
  folder options are hidden; they need the File System Access API (which Safari
  lacks), and there is no screen for resolving an external change to a file.
  The code stays in place. `?local-folders=true` turns it back on for
  development only; it is not a supported path.
- Safari and Firefox as supported browsers. Safari runs the app with browser
  storage only; Firefox cannot open local folders and is not tested.
- DOCX import and export.
- Chapter-level pagination, block-level rendering (plan item B13), and the
  1,000-page guarantee.

## Limits to know about

- **Large documents.** Documents above 400,000 characters may be slower. They
  open in the live preview, and the print preview is built on request with the
  Build print preview button. The background compile worker is on for Safari
  between 400,000 and 700,000 characters, and elsewhere it is opt-in with
  `?compile-worker=true`.
- **Backups are manual.** Nothing backs up by itself. A browser can clear its
  storage when disk space is low, so download a backup after each writing
  session that matters. A backup holds the project's files, not its trash. It is
  built in memory, so a very large project (hundreds of megabytes of images) may
  not fit; ZIP64 archives are not read.
- **Crash recovery is best-effort.** Typing is saved after a pause of about
  0.75 s. During continuous typing a recovery draft is written at least every
  second (up to every 5 s for documents above 200,000 characters). A crash can
  lose that much typing.
- **Trash.** Deleted sections go to the project's trash and stay until they are
  deleted for good from the Trash dialog. Nothing empties the trash by itself.

## Acceptance run

`npm run test:acceptance` drives the real app in Chromium through one session:
create a browser-storage project, create a section, type, watch the save
status, reload, crash the browser with unsaved typing, restore the draft, check
the preview, export a PDF, delete the section and restore it from the trash,
download a backup, and import that backup as a new project.
Screenshots and the PDF go to `CLEAR_WRITER_ACCEPTANCE_DIR`.

It is an automated run, not a person using the app. The print dialog itself is
not clicked: the run stubs `print`, takes the document the app prepared for
printing, and prints that to a PDF in Chromium's headless shell (set
`CLEAR_WRITER_PDF_BROWSER` if it is not found). It uses one short document and
one browser.

## Manual acceptance

The automated run does not replace a person using the app. Before relying on it
for real work, do the pass in [manual-acceptance.md](manual-acceptance.md)
yourself in the browser you will use.
