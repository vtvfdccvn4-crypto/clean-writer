# MVP Scope

The working MVP is deliberately narrow. It is meant to be relied on for real
writing in one setup, and the large-document work continues alongside it.

## Supported

- **Browser:** desktop Chromium.
- **Storage:** browser-managed projects (stored in the browser's private file
  system).
- **Workflow:** Markdown editing, live preview, the paginated preview, and PDF
  export through the browser's print dialog ("Save as PDF").
- **Documents:** ordinary documents. Very large documents are experimental.

## Not in the MVP

- Local-folder projects. The folder options are hidden; they need the File
  System Access API (which Safari lacks), and there is no screen for resolving
  an external change to a file. `?local-folders=true` turns them back on for
  development.
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
- **No backup export.** There is no Markdown or project export. PDF is the only
  output, so the project lives only in this browser's storage. A browser can
  clear that storage when disk space is low. Keep a PDF of important work.
- **Crash recovery is best-effort.** Typing is saved after a pause of about
  0.75 s, and a recovery draft is written at least every 5 s while typing. A
  crash can lose the last few seconds of typing.
- **Trash.** Deleted sections go to the project's trash and stay until they are
  deleted for good from the Trash dialog. Nothing empties the trash by itself.

## Acceptance run

`npm run test:acceptance` drives the real app in Chromium through one session:
create a browser-storage project, create a section, type, watch the save
status, reload, crash the browser with unsaved typing, restore the draft, check
the preview, export a PDF, delete the section and restore it from the trash.
Screenshots and the PDF go to `CLEAR_WRITER_ACCEPTANCE_DIR`.

It is an automated run, not a person using the app. The print dialog itself is
not clicked: the run stubs `print`, takes the document the app prepared for
printing, and prints that to a PDF in Chromium's headless shell (set
`CLEAR_WRITER_PDF_BROWSER` if it is not found). It uses one short document and
one browser.
