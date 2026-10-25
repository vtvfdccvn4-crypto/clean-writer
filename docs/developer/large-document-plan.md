# Large-Document Implementation Plan (1,000 pages)

Status: approved plan, 2026-10-24. Phase 0 and the first Phase 1 pagination
fixes are in progress. This page is a plan, not a description of shipped
behavior: a feature counts as shipped only when a source path and a regression
test or smoke fixture support it (see `docs/developer/current-state-handoff.md`).

Each claim carries one label:

- **[C] Confirmed** by code or an experiment recorded here.
- **[H] Hypothesis** that still needs validation.
- **[P] Design decision** that needs a prototype before it is committed.

## 1. Recommendation

The app is **not ready** for 1,000-page documents [C]. Typing does
full-document work on every editor transaction, live preview re-parses the
whole section on every refresh, the full compile blocks the main thread for
about 4–7 s, the current same-origin pagination frame froze the parent page in
the tested browser, export hits a hard 300 s cap, and recovery drafts can fail
silently.

Safe now: remove keystroke-path full-document work; pagination correctness
(single job, frame invalidation on cancel, Paged.js cleanup, stall watchdog);
draft durability; service-worker precache and update flow; accessibility; then
a worker compiler behind a production-build integration test.

Needs proof first: truly incremental live preview with cross-block
correctness; the large-document live-preview threshold; process isolation for
the pagination frame per browser; and any chapter-level pagination or cache,
which stays a time-boxed feasibility prototype with a "do not proceed" outcome.

## 2. Evidence

| # | Finding | Status | Evidence |
|---|---|---|---|
| E1 | Full-document work on every editor transaction | C | `editor/createEditor.ts:92-96`; `ui/DocumentRenderCoordinator.ts:191-194` → `editor/DraftRecoveryStore.ts:21-31`; `editor/extensions/customStyleHighlighting.ts:47,70,150`; `editor/extensions/tableHelpers.ts:43,101-110` |
| E2 | Draft write failures are only logged | C | `DraftRecoveryStore.ts:27-29` |
| E3 | Save status depends on the preview revision | C | `DocumentRenderCoordinator.ts:222-234` |
| E4 | Preview refresh is driven by the 750 ms autosave | C | `DocumentRenderCoordinator.ts:204-212`; `DocumentSaveCoordinator.ts` |
| E5 | "Incremental" preview is O(document): full remark parse (2.2 s at 1,000 pages), full reassembly, full re-parse in the renderer | C | `preview/live/IncrementalPreviewCompiler.ts:109-124,171-203`; `preview/live/LivePreviewRenderer.ts:38-45` |
| E6 | Separately compiled chunks break cross-chunk references and duplicate ids | C | Node experiment: `[spec]` and `[^a]` resolve combined, not per chunk; concatenation duplicated `user-content-footnote-label` |
| E7 | Full compile runs on the main thread | C | `compiler/index.ts:97-127`; 7.2 s in Node, 4.0 s in a Chromium worker at 1,000 synthetic pages (different corpora) |
| E8 | Compiler import closure has no `document`/`window`/`localStorage`/`state` use | C | Static scan of the closure of `src/compiler/index.ts` |
| E9 | Default browser resolution crashes the compiler in a worker | C | `decode-named-character-reference/index.dom.js` → `ReferenceError: document is not defined`; the `worker` export condition fixes it |
| E10 | The tested compiler path runs in a worker | Partly C | One-off bundle only; production build, assets, cancellation and full feature parity untested |
| E11 | Settings equality is by object identity | C | `compiler/settings.ts:39-45` — breaks across a structured clone |
| E12 | The current same-origin frame froze the parent | C (tested config) | 2 s busy loop in the frame → 0 parent timer ticks in Chromium 153, with and without forced site isolation. Other browsers must be measured |
| E13 | Sandboxed/cross-site frames run independently | Unproven | Only with `--site-per-process --enable-features=IsolateSandboxedIframes` in that build; blob URLs and origin checks untested |
| E14 | Abort does not stop the frame; jobs can overlap | C | `pdf-preview/IsolatedPaginationHost.ts` (slot released on abort); `boot/pdf-preview-frame.ts` (no job guard) |
| E15 | Paged.js styles accumulate in the warm frame | C | `Previewer` never destroyed; Paged.js `Polisher.setup()`/`insert()` append `<style data-pagedjs-inserted-styles>`, removed only by `destroy()` |
| E16 | Export time limit for 1,000 pages | Revised: the fixed cap is replaced; the 650 ms/page estimate is not supported by measurement | Old `PdfPreviewPaginationBudget.ts` cap of 300 s with an estimate of 15 s + 650 ms × pages. Headless Chromium 153, 800 simple sections with forced breaks: 800 pages in 7.3–7.4 s (two runs, about 9 ms/page). Heavy content (images, tables, margins) and real hardware are still unmeasured |
| E17 | Paginated mode is default and repaginates after edits | C | `ui/PaginatedPreviewRenderer.ts` (`_isActive = true`); `DocumentRenderCoordinator.ts:322-329` |
| E18 | Paginated DOM has no containment | C | No `content-visibility` in `src/` |
| E19 | Pagination message carries the document twice | H | `PdfRenderSnapshot.ts`: `key.document` and `html` are the same string |
| E20 | SW precaches only the shell; forced activation; prune on navigation | C | `public/sw.js` install/activate/fetch |
| E21 | Storage is never made persistent | C | No `persist()`/`estimate()` in `src/` |
| E22 | Outline items are not keyboard-operable; no reduced motion | C | `ui/document-outline.ts`; no `prefers-reduced-motion` |
| E23 | Chapter-level pagination works today | Disproved | Page breaks opt-in (`pageBreaks: []`); document-wide heading numbering; margin pass carries state; E6; Paged.js `page-${index}` ids and `pagedjs_first_page` |
| E24 | TOC page numbers and margins run after pagination | C | `PdfPreviewTocPageNumbers.ts`, `PdfPreviewMarginRenderer.ts`; `includePageCounters` is never enabled |
| E25 | Core folders do not import `state` | C | compiler, preview, pdf-preview, print, platform, images: none; editor: one file; `ui/`: 28 files |
| E26 | IndexedDB/OPFS drafts will be durable | Unproven | Design only |
| E27 | Lezer block boundaries match remark's | Doubtful | Editor uses `markdown()` without GFM; the compiler uses `remark-gfm` |

## 3. Near-term architecture

```
Editor tx ─► change hub {version, changed ranges, Text ref}   (no full-text conversion)
   ├─► DraftWriter   debounce 1 s / max wait 5 s ─► IndexedDB {baseHash, contentHash, schema}
   ├─► SaveScheduler 750 ms, serialized per path ─► WorkspaceSession.writeSection
   │        └─► SaveStateModel (save + draft health + preview freshness + pagination)
   └─► PreviewScheduler (latest wins) ─► BlockIndexer (bounded re-lex)
            ─► CompileClient ─postMessage(strings, block records, settings, asset map)─► compile worker
                 ◄─ result | error  (stale jobId/revision dropped)
            ─► DocumentIndex (headings, ids, definitions, TOC, numbering)
            ─► LivePreviewRenderer (block-keyed DOM, contained)
PaginationScheduler (on demand / idle; single flight)
   ─► IsolatedPaginationHost ─{protocol, buildId, requestId}─► frame
        cancel ⇒ invalidate frame; stall watchdog; progress
   ─► PdfArtifactStore ─► PreviewController / PdfPreviewPrintTarget
Service worker: precache shell + asset manifest; waits for the user before activating;
   navigation network-first, offline fallback from the current build's cache only;
   hashed assets cache-first from the current and previous build caches only.
```

The worker receives only structured-cloneable data: strings, block records,
settings snapshots and an asset URL map — never a CodeMirror `Text`.

## 4. Phases

- **Phase 0 — baselines (4–6 d).** Benchmark corpus, typing harness with
  long-task capture, pagination profiles at 300/600/1,000 pages, feature flags,
  baseline report in `reports/`.
- **Phase 1 — correctness, durability, PWA, accessibility (3–4 weeks).** Editor
  input path; preview scheduling separate from saves; IndexedDB drafts;
  pagination single-flight, frame invalidation on cancel, Paged.js cleanup,
  stall watchdog, progress and cancel UI; writable abort; service-worker
  precache and update prompt; outline keyboard support; reduced motion.
- **Phase 2 — worker compiler and incremental live preview (4–6 weeks).**
  Gated by G1.
- **Phase 3 — large-document paginated preview (3–4 weeks).** Live default
  above a measured threshold, freshness state, on-demand/idle pagination,
  containment, page jump; optional per-browser frame-isolation experiment (G3).
- **Phase 4 — chapter composition prototype (2–3 weeks, time-boxed).** Gated
  by G2; outcome recorded either way (G4).

## 5. Key designs

### Editor input path
No full-document string conversion in the keystroke path. The update listener
records the version, the changed ranges and a reference to the immutable
CodeMirror `Text`. Full text is produced only when a debounced consumer runs
(save timer, draft writer, preview job); incremental preview receives
changed-block strings sliced from the `Text`. Custom-style highlighting covers
`view.visibleRanges` only; table decorations are mapped through changes and
only changed ranges plus table-boundary margins are re-parsed.

### Drafts
IndexedDB, one record per `[projectId, path]`, schema version 1, with
`contentHash`, `baseHash`, `updatedAt` and `editorVersion`. Writes are debounced
1 s with a 5 s maximum wait. Flushes on `visibilitychange` and `pagehide` are
best-effort only: asynchronous writes may not complete during unload, so the
real protection is frequent persistence while editing (worst-case loss about
5 s of typing). Quota is checked with `navigator.storage.estimate()`;
`navigator.storage.persist()` is requested when a project is first opened.
Write failures set a visible draft-health state. Drafts are pruned when saved
content matches, when their path leaves the tree, after 30 days, and above a
total cap. Corrupt records (hash mismatch) are kept and offered for export.
Existing `localStorage` drafts are migrated once.

### Worker compiler
The worker build resolves the `worker` export condition (or aliases
`decode-named-character-reference` to `index.js` for the worker only); a build
check fails if `index.dom.js` reaches the worker chunk. The asset resolver is
replaced inside the worker by a path → URL map built on the main thread after
preloading. Settings are identified by a content hash. Results are accepted only
for the latest `jobId` and current revision; long full-document jobs are
replaced by terminating the worker, because parsing is synchronous. A fatal
worker error falls back to the main-thread compiler for the session.

### Live preview
Bounded re-lexing with remark around changed ranges (not Lezer, see E27).
Blocks keep stable ids by content hash. Definitions (link references and
footnotes) are tracked in a document index; blocks compile with a definitions
prelude [P], or fall back to a full section compile while footnotes change.
Heading numbering, special headings and TOC are driven by the index. A
differential test compares block mode with a full compile after random edits.

### Pagination
One frame job at a time. Cancel invalidates the frame: Paged.js layout runs
synchronously between queue ticks, so removing the frame is the only way to
guarantee the work and its DOM and styles are released. The queue slot is
freed only after teardown. After every job the frame destroys the Paged.js
polisher and clears its stage. A progress-aware stall watchdog replaces the
fixed cap. Requests and the ready message carry a protocol version and build id.

Process isolation (sandboxed or cross-site frame) is a per-browser experiment.
It ships only if every supported browser passes G3.

### Service worker
Precache the shell plus a build-generated asset manifest. Do not call
`skipWaiting()` on install; show an update prompt, flush saves, then activate.
Navigation is network-first with an offline fallback from the current build's
cache only, so an old shell is never served after a newer build installs.
Hashed assets are served cache-first from the current and previous build caches
so open old tabs keep loading their chunks; caches two or more builds old are
deleted on activate (optionally client-aware).

### Chapter composition prototype
"Stitching" means combining paginated HTML page artifacts in one page DOM before
`window.print()`, not merging PDF files. The prototype must show, against a
single-pass render: footnotes and references resolve with unique ids; internal
links resolve; Paged.js page ids are renumbered and first/last-page classes
appear once; generated CSS has no conflicting `@page` rules; running
headers/footers, TOC page numbers and page counters match; print-to-PDF page
count and text match; bookmarks are recorded per browser; and repaginating
after a one-section edit costs at most 20% of a full run.

## 6. Budgets (provisional until Phase 0)

| Metric | Corpus | Release gate | Stretch |
|---|---|---|---|
| Typing | 1,000 pages in one section | No long task > 50 ms during scripted typing; p95 INP ≤ 100 ms | Keystroke-to-paint p95 ≤ 16 ms |
| Draft persisted after last keystroke | same | ≤ 2 s (≤ 5 s during continuous typing) | |
| Live preview after a one-block edit | same | ≤ 300 ms after the scheduler fires; ≤ 50 ms main-thread work | |
| Full compile in worker | 1,000 pages / 50 sections | ≤ 5 s cold, ≤ 300 ms warm cache; no main-thread task > 50 ms except the DOM commit (≤ 200 ms) | |
| Pagination | 1,000 pages | Finishes or fails visibly through the stall watchdog, never a fixed cap; progress ≤ 1 s apart; cancel → responsive ≤ 500 ms. Throughput target set from Phase 0 measurements | |
| Repeated pagination | | ≤ 5% heap growth, 0 extra Paged.js style elements over 10 runs | |
| Offline cold boot after first install | | ≤ 3 s to an interactive editor | |

## 7. Decision gates

- **G1 (immediate fixes → worker).** Typing gates met on the single-section
  corpus; draft durability matrix passes on Chromium, Firefox and WebKit (or
  fails visibly); pagination concurrency and repeated-layout tests pass;
  offline first-install and update-with-old-tab tests pass; no regressions.
- **G2 (worker by default).** Production-build worker test passes and the
  worker chunk contains no `index.dom.js`; differential output matches on the
  whole corpus; compile and long-task budgets met; cancel/replace and error
  fallback pass; result transfer ≤ 100 ms for the 50-section corpus.
- **G3 (isolated frame, optional).** On every supported browser with default
  settings: parent timer ticks within 20% of idle during a frame busy loop;
  images render; hostile-message tests pass. Any failure: do not ship.
- **G4 (chapter composition).** Every prototype requirement passes; print
  output matches in Chromium and Firefox; repagination after one-section edit
  ≤ 20% of a full run; non-page-break sections handled by grouping.
  **Do not proceed** if correctness fails without a contained fix, savings are
  below 2×, or Paged.js internals need patching beyond the existing null
  guards. Keep whole-document pagination and record the decision.

## 8. Backlog

| ID | Priority | Item | Depends on |
|---|---|---|---|
| B1 | Critical | Phase 0 corpus, typing harness, 1,000-page profiles, flags | — |
| B2 | Critical | Editor input path: no full-text conversion per keystroke, viewport highlighting, incremental tables | B1 |
| B3 | Critical | IndexedDB drafts with hashes, schema, migration, health state | B1 |
| B4 | Critical | Pagination single-flight; frame invalidation on cancel; slot released after teardown | — |
| B5 | High | Paged.js polisher and stage cleanup after each job | B4 |
| B6 | High | Stall watchdog replacing the 300 s cap | B4, B1 |
| B7 | High | Save state independent of preview revision; preview scheduler | B2 |
| B8 | High | Service-worker precache, update prompt, cache retention | — |
| B9 | High | `persist()`, `estimate()`, quota UI | B3 |
| B10 | High | Pagination progress, cancel and announcements | B4, B6 |
| B11 | High | Keyboard-operable outline; focus and scroll preserved | — |
| B12 | High | Production-build compile worker | G1 |
| B13 | High | Block model, document index, block-keyed renderer, differential tests | B12 |
| B14 | Medium | Live default above a measured threshold; freshness state; on-demand pagination | B1, B10 |
| B15 | Medium | `content-visibility` on pages and blocks | B14 |
| B16 | Medium | Hash-based `PdfArtifactKey` (validates E19) | B1 |
| B17 | Medium | Writable abort on failure; trash-based delete; external-modification check | — |
| B18 | Medium | External links with `noopener`; print waits for image decoding | — |
| B19 | Medium | Page jump, heading navigator, reduced motion, status region | B11 |
| B20 | Medium | Frame-isolation experiment (G3) | B4–B6 |
| B21 | Medium | Chapter composition prototype (G4) | G2 |
| B22 | Low | Gradual `state` injection: lint rule, editor options, snapshot adapters, then move coordinators | B12, B13 |

## 9. Progress log

- 2026-10-24: plan approved.
- 2026-10-24: B4 and B5 implemented. The frame is discarded on a posted-job
  abort (`IsolatedPaginationHost.ts`); the frame refuses overlapping jobs with a
  busy message; Paged.js styles and page DOM are disposed after serialization
  (`PdfPreviewFramePaginator.ts`, `boot/pdf-preview-frame.ts`). Regression:
  `pagination-lifecycle-smoke`. Measured against the original code it fails
  (CSS 24 KB → 96 KB over four runs; `cancelDiscardedFrame: false`) and passes
  with the fix. The 261 unit tests and all 40 browser smokes pass.
- Not yet done: Phase 0 corpus
  and typing harness (B1), and the per-browser measurement of the frame freeze.
- 2026-10-24: B6 implemented. The 300 s cap is replaced by a stall limit (no new
  page for 60 s, or 120 s with images) and a 45-minute ceiling
  (`PdfPreviewPaginationBudget.ts`, `IsolatedPaginationHost.ts`). The host also
  takes limit overrides for tests. Regression: `pagination-watchdog-smoke`
  covers a stall (frame discarded), a ceiling hit, and an 8-second job that
  outlives a 1.5-second stall limit because pages keep arriving. Measurement
  behind the correction to E16: 800 pages in about 7.3 s in headless Chromium.
  This is one machine with simple content and does not replace the Phase 0
  corpus.
- 2026-10-24: B3 implemented (started before B1 was complete; B1 remains open).
  `src/editor/DraftStore.ts` (IndexedDB backend, memory backend, hashes, health,
  quota retry, migration, pruning), `src/editor/DraftWriter.ts` (per-section
  debounce with maximum wait, ordered writes and discards, retry), and the
  coordinator changes in `src/ui/DocumentRenderCoordinator.ts`. Unit tests:
  `test/draft-store.test.cjs` (18). Browser: `browser-draft-store-smoke`
  (survives a reload, detects tampering, ignores newer schemas, discards on
  save) and the OPFS persistence smoke now checks that the draft is removed
  after a save.
  Not yet validated: Firefox and WebKit (the plan's matrix), quota pressure in
  a real browser, the hard-kill test, and `persist()`/`estimate()` (B9).
  The editor still builds the whole document string on every keystroke (B2);
  the writer only keeps a reference to it.
- 2026-10-24: B2 implemented. Baseline (before), headless Chromium 153, one
  machine, 1,000 synthetic pages (about 2.2 MB), 200 keystrokes: dispatch
  median 11 ms, p95 36-38 ms; keystroke to next frame p95 41-42 ms; 2-7 long
  tasks, longest 53-77 ms. After: dispatch median 4.4-4.5 ms, p95 6-12 ms;
  keystroke to next frame p95 17.5-17.7 ms (median 16.7 ms, the frame interval);
  no long tasks. Benchmark: `editor-typing-bench` (opt-in).
  Changes: `EditorSnapshot` replaces the per-keystroke string
  (`createEditor.ts`), `DocumentSaveCoordinator` and `DraftWriter` take values
  that are stringified when a write runs, custom-style highlighting decorates
  `view.visibleRanges` (`customStyleHighlighting.ts`), and table decorations are
  mapped through changes and re-parsed only between blank lines
  (`tableHelpers.ts`). The re-parse bound was not the first choice: widening by
  table rows alone diverged from a full rebuild, because a delimiter row can
  contain no pipe and the parser scans greedily. The property test found it.
  Tests: `table-decorations-incremental.test.cjs` (20 seeds, 300 random edits,
  compared with a full rebuild), `editor-viewport-highlight-smoke` (fails on the
  original code, passes now).
  Correction: `tableSourceVisibility` was already mapped through changes
  (`tableHelpers.ts`), so no change was needed there.
  Not done in B2: `imageBlockPointerDrag.ts` and `createEditor.ts`
  (`editImagePresentation`, `editTablePresentation`) still stringify the
  document on pointer and command events, not on keystrokes.
  Still open: the Phase 0 corpus (B1), the release-gate budgets, and the
  preview refresh path, which is B7.
- 2026-10-25: B7 implemented. Preview refresh and save state are no longer
  coupled. `PreviewScheduler` (`src/ui/PreviewScheduler.ts`) runs the refresh
  after a 250 ms pause in live mode, or 750 ms in the paginated preview. The
  refresh starts its revision when it runs, not per keystroke, because starting
  a revision cancels in-flight pagination. The save path no longer begins a
  revision, starts a refresh, or sets "saving" for a preview. A save reports
  "saved" only when its snapshot version is still the newest edit
  (`DocumentRenderCoordinator.ts`, `latestVersion`).
  Measured: the live preview showed a typed edit after 277 ms, against 785 ms
  on the previous coordinator (`browser-preview-freshness-smoke`, which fails
  on the old code). Unit tests: `preview-scheduler.test.cjs` (5).
  Not covered by an automated test: the "saved only when newest" race, which
  needs a controlled save to test. It is verified by code reading only.
  Still open: the freshness state visible to users (B14), and the paginated
  preview's own cost (B14, B15).
- 2026-10-25: B8 implemented. `public/sw.js` precaches the shell and the full
  build list in one `addAll` (the build writes the list and the build id into
  the worker; `vite.web.config.ts`). Install no longer calls `skipWaiting`; the
  page does, after the user accepts the prompt (`src/sw-registration.ts`), which
  saves the open document first. Only the accepting tab reloads. Retention keeps
  the active build and the one it replaced. Navigation is network-first, and the
  offline fallback comes only from the current build. Network responses are not
  written into the cache.
  Found during the browser check: the worker took its build id from its URL's
  `?v=` parameter. An update check re-requests the URL the page registered with,
  which names the old build, so the new worker wrote into the old cache. The
  build now writes the id into the worker file.
  Tests: `service-worker-cache.test.cjs` (14), `release-pwa-smoke.mjs` (first
  install offline, a two-tab update, and a retained chunk after the update).
  Each was shown to fail when its behaviour is removed: cross-build offline
  fallback, current-only asset lookup, dropping the previous build, every tab
  reloading, no precache, and the URL-based id.
  Not done: the other tab does not switch to the new worker until it reloads,
  and nothing tests a tab that is two builds old. The offline export and preview
  check, the update prompt's wording under other locales, and the frame protocol
  version (plan §5.5) are still open.
- 2026-10-25: B9 implemented. `src/platform/storage-quota.ts` reads
  `navigator.storage` (persisted, estimate) and requests persistence. It treats
  a missing or failing API as unsupported or unknown, never as zero. Levels:
  warning at 80%, critical at 95%. `src/ui/storage-status.ts` requests
  persistence once per session when a project opens, warns once per rising level
  (checked on open and every five minutes), and fills a Storage card in the
  shell preferences drawer.
  Tests: `storage-quota.test.cjs` (9 unit tests, including the 80%/95% boundaries
  and the failure cases), and `browser-storage-status-smoke` (the real
  StorageManager; a stubbed 90% estimate shows the warning once).
  Measured in headless Chromium: usage 0 of a 10 GB quota, and persistence was
  not granted, so the card shows "not protected". Chromium's decision depends on
  engagement, so a real profile may show a different answer.
  Not done: the draft-store quota handling (B3) is not yet tied to this
  estimate, and Firefox and WebKit persistence behaviour is unchecked.
- 2026-10-25: B10 implemented for the PDF preview (export) job. The strip
  (`src/ui/pdf-job-status.ts`, in the preview footer) shows the phase, a native
  `<progress>` (indeterminate until a page count exists; the maximum grows past
  the estimate), and a Cancel button. A `role="status"` live region, outside the
  hidden strip, announces the start, every 25 pages, the print dialog, and the
  outcome (`setupPdfPreview.ts` drives it; Escape still cancels).
  Tests: `pdf-job-status.test.cjs` (6), `browser-pdf-job-status-smoke` (progress,
  milestones without floods, keyboard-focusable Cancel, one handler per click —
  the mutation that re-adds listeners fails it), and
  `browser-pdf-export-progress-smoke` (the real export in a stand-in print frame,
  since headless Chromium blocks pop-ups; the strip appears and Cancel ends the job).
  Not done: the in-app paginated refresh has no progress strip (B14 covers the
  freshness state); axe, NVDA and VoiceOver checks, zoom and forced-colors have
  not been run; the real-browser pagination progress rate is unmeasured (B1).
- 2026-10-25: B11 implemented. `src/ui/outline-view.ts` renders the outline as
  buttons with a roving tab stop (Arrow keys, Home, End), and delegates clicks and
  keys once on the container. Each section's markup is cached by key, so a save
  replaces only the sections whose markup changed. Focus is restored by heading
  identity (text plus occurrence, not line), then by position; scroll is kept.
  `document-outline.ts` now only chooses what to show.
  Tests: `outline-view.test.cjs` (3), `browser-outline-view-smoke` (keyboard
  movement, activation, node reuse, focus and scroll across re-renders, a moved
  heading keeping focus). A mutation that rebuilds every section fails it.
  Caught while building: the first identity used the line number, so focus moved
  to a neighbouring heading when a line shifted. It now uses the text.
  Not done: `aria-current` on the heading at the caret (no caret event reaches the
  outline yet); page jump and reduced motion (B19); axe, screen-reader, zoom and
  forced-colour checks. The keyboard test dispatches key events, not real key
  presses.
- 2026-10-25: B12 implemented behind the `compile-worker` flag, which is off by
  default. Gate status: G1 is not fully met (no Phase 0 corpus, B1; no Firefox or
  WebKit matrix), so the worker stays off. G2 is partly met (see below).
  Pieces: `compile-protocol.ts` (structured-clone messages), `compile-core.ts`
  (DOM-free compile, snapshot asset resolver, result cache keyed by text,
  settings, assets, and line offsets, capped at 48 entries and 32M characters),
  `compile.worker.ts`, `CompileClient.ts` (one current job per lane, supersession
  with cancel, worker replacement for a long superseded job, crash and
  protocol-mismatch fallback that re-runs pending jobs on the page), and
  `compile-assets.ts` (path-to-URL map built after preloading).
  Build: `vite.web.config.ts` resolves `decode-named-character-reference` to its
  plain entry for worker bundles only (`worker.plugins`). A build check fails if
  a worker chunk calls `document.createElement`. Removing the resolution fails the
  build, which was checked.
  Tests: `compile-worker.test.cjs` (17, against the real worker core in Node),
  and `release-compile-worker-smoke.mjs` (a separate harness build with the same
  worker configuration, run in Chromium). The harness checks parity with an
  independent page resolver at 1,000 pages, cache hits, supersession, error and
  clone messages, crash recovery, and responsiveness. Mutations were caught: an
  asset map ignored (parity fails) and a DOM dependency restored (build fails).
  Measured (headless Chromium, one machine, 1,000 pages, about 3.1 MB of HTML):
  page compile 5.97 s as one long task, frame gap 5.95 s; worker compile 5.5 s,
  no long tasks, frame gap 17 ms. The real app with the flag on creates the
  worker (checked from the console).
  Not done: G2 criteria for result transfer time are not measured separately
  from the compile; Firefox and WebKit are not checked; the live incremental
  preview stays on the page (it needs DOM work, plan Phase 2 B13); the worker
  cache is lost when the worker is replaced.

- 2026-10-25: B13, option 1 chosen (the live preview compiles the whole section;
  block reuse is removed). Findings, from `live-preview-differential-smoke` (now
  deleted; its last commit is c5bc0d1), run in headless Chromium:
  - Default corpus, 1 page, cross-block reference and footnote: 150 of 150 edits
    differ. Confirmed in the live path: E6.
  - Local corpus, 1 page: 46 of 150 differ. The first difference is an unclosed
    code fence that absorbs the section's closing `</div>`, because each block
    is wrapped with the closing markup.
  - Local corpus, 300 pages: 118 of 150 differ. Incremental 817 ms, full 287 ms,
    so the incremental path was also slower. An earlier 20-step run with 0
    mismatches was sampling noise.
  Change: `PreviewCoordinator.runLatestCompile` calls the same compile as the
  full-document path (worker when the flag is on, page otherwise). A superseded
  worker compile resolves as stale. `IncrementalPreviewCompiler` and its unit
  test are deleted; nothing else used them. Verified: typecheck, 327 unit tests,
  and the default browser smoke suite pass.
  Not done: the block model and block-keyed renderer (the rest of B13) are not
  needed for correctness and are not built; the renderer still reconciles by
  `data-ref`. The live path stays on the page by default: about 290 ms per update
  at 300 pages, so B14 must decide the default for large documents.
  Found while checking the worker flag: `browser-authoring-performance-smoke`
  fails with the flag on, on HEAD as well. The worker returns no phase timings on
  a cache hit, and the fixture expects them on a repeat compile of unchanged
  text. Not fixed here; it is outside the default smoke gate.
