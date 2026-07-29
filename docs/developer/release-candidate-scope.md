# First Release Candidate Scope

## Decision

The current working tree is the proposed scope for the first web release
candidate. It is a product-focused simplification and reliability refactor,
not a backwards-compatible continuation of every previously present feature.

The release candidate includes the following tested capabilities:

| Area | Included behaviour | Primary implementation areas |
| --- | --- | --- |
| Project workflow | Create, open, reopen, recover, and persist browser-backed and local-directory projects | `src/platform/`, `src/services/`, `src/ui/project-opening.ts` |
| Task explorer | File/folder creation, selection, nesting, reordering, visibility, and image management | `src/ui/task-*.ts`, `src/ui/components/TaskPanel.ts` |
| Authoring | Markdown editing, formatting commands, drag/drop, image insertion, and image block moves | `src/editor/`, `src/ui/editor-manager.ts` |
| Live preview | Incremental document preview, source-to-preview navigation, styles, headings, lists, and tables | `src/compiler/`, `src/preview/`, `src/print/` |
| PDF workflow | Isolated PDF preview, printable output, page setup, page guides, headers/footers, TOC page numbers, and performance budgets | `src/pdf-preview/`, `src/boot/setupPdfPreview.ts` |
| Web shell | Relative-path hosting, PWA manifest, service-worker cache versioning, and offline shell validation | `vite.web.config.ts`, `public/sw.js`, `src/sw-registration.ts` |
| Release safeguards | Unit, performance, bundle-budget, browser, PDF-scale, and production-shell smoke coverage | `test/`, `scripts/`, `package.json` |

## Intentional removals and replacements

The deleted files are part of the scope; they are not accidental omissions.
Build and test verification confirms no remaining imports depend on them.

| Previous capability | Release-candidate decision |
| --- | --- |
| DOCX import/export and its `docx`/`jszip` dependencies | Excluded. The first release candidate supports browser printing/PDF preview; DOCX is deferred. |
| Legacy browser export service and background export pipeline | Replaced by the isolated PDF preview pipeline. |
| Legacy sidebar/project-explorer implementation | Replaced by the task-panel explorer. |
| Legacy preview render engine and print paginator helpers | Replaced by the isolated pagination/PDF-preview modules. |
| Legacy worker and export-pagination frame | Removed with the former export path. |
| VS Code migration plan | Removed as obsolete project documentation. |

## Explicitly out of scope for this RC

- DOCX import or export.
- A native desktop application or VS Code migration.
- Cloud sync, accounts, collaboration, or server-side project storage.
- A public deployment choice and CI/CD setup (these are release tasks, not product features).

## Evidence for this scope

The current tree passed the following release checks on 2026-07-29:

- `npm run build`
- `npm test` (181 passing tests)
- `npm run test:perf`
- `npm run check:bundle` (initial JavaScript chunk 70,315 bytes / 17,060 bytes gzip)
- `npm run test:browser-smoke`
- `npm run test:pwa-smoke`

## Approval boundary

Before committing the RC, confirm that omitting DOCX import/export is acceptable
for the first public release. If it is not, that feature must be restored and
given dedicated browser and compatibility acceptance coverage before this scope
can be approved.
