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
| E16 | 1,000 pages exceed the timeout cap | C (arithmetic) | `PdfPreviewPaginationBudget.ts`: 15 s + 650 ms × pages, capped at 300 s. Real seconds per page unmeasured |
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
- Not yet done: B6 (stall watchdog replacing the 300 s cap), Phase 0 corpus
  and typing harness (B1), and the per-browser measurement of the frame freeze.
