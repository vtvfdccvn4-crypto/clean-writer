# Phase 0 baseline

Measured on 2026-10-25 at commit `de7a054` (branch `claude/jolly-noether-7mqanv`).

**Status: a single-machine baseline, not a gate.** It records the current numbers
so later changes can be compared against them. It does not decide the release gates
in `docs/developer/large-document-plan.md`, because those need repeated runs on
real hardware and browsers. WebKit has not been measured. Firefox is out of scope (it cannot open local desktop files, which local-directory projects need).

## Environment

| Item | Value |
|---|---|
| Machine | Linux container, 4 vCPU (Intel Xeon 2.10 GHz), 16 GB RAM |
| Browser | Google Chrome for Testing 153.0.8010.12, headless |
| Runtime | Node v22.22.0 |
| Other browsers | Not measured (WebKit). Firefox is out of scope. |
| Samples | 1 per pagination scenario; 3 per typing run, with the three runs reported separately |

## Corpora

- **Typing (`editor-typing-bench`):** one section of 1,000 pages, 2.2 M characters.
  Headings, paragraphs, a list, and a table every tenth page.
- **Pagination scale (`profile-pagination.mjs --scale`):** one section per page, with a
  forced page break at each heading. Two extra representative scenarios (240 and 260
  pages) use the layout-profile corpus.

## Results

### Typing (1,000 pages in one section, 200 scripted keystrokes)

Each keystroke is a CodeMirror transaction followed by a frame. These are synthetic
dispatches, not OS keyboard input, so INP is not measured.

| Run | Dispatch p50 | Dispatch p95 | Dispatch max | Keystroke-to-frame p95 | Long tasks | Longest |
|---|---|---|---|---|---|---|
| 1 | 4.4 ms | 15.1 ms | 16.3 ms | 18.0 ms | 1 | **51 ms** |
| 2 | 3.8 ms | 6.7 ms | 15.9 ms | 17.6 ms | 0 | — |
| 3 | 4.3 ms | 6.3 ms | 9.2 ms | 16.9 ms | 0 | — |

Run 1 has one long task of 51 ms, just over the 50 ms release gate. The cause is not
known. Frame p95 is close to the 16.7 ms frame interval, so it is limited by the
display, not by the editor.

### Pagination (isolated frame, one sample each)

| Scenario | Pages | Elapsed | Heap used | Status |
|---|---|---|---|---|
| scale-50 | 50 | 517 ms | 14.4 MB | success |
| scale-100 | 100 | 429 ms | 17.0 MB | success |
| scale-200 | 200 | 752 ms | 19.7 MB | success |
| scale-300 | 300 | 1,569 ms | 27.8 MB | success |
| representative-240 | 240 | 1,531 ms | 31.2 MB | success |
| representative-260 | 260 | 1,630 ms | 27.3 MB | success |
| scale-600 | 600 | 4,208 ms | 22.3 MB | success |
| scale-1000 | 1,000 | 8,679 ms | 30.3 MB | success |

Cancellation during pagination was checked in each profile run and returned
`cancelled` with no orphaned frames.

**Estimator:** at 1,000 pages the budget estimate is 668 pages, so
`estimatePdfPreviewBudget` underestimates by about a third on this corpus. The stall
and ceiling limits use that estimate, so the calibration needs to account for it.

**Repeated pagination** (heap growth and style-element count over 10 runs) was not
measured here. It needs its own run.

## Feature flags

Flags are read from the address query. Each is off unless its value is `true`.

| Flag | Purpose | Default | Gate |
|---|---|---|---|
| `compile-worker` | Full and single-document compiles in a worker | off | G2 |
| `pdf-preview` | Opens the PDF preview as a standalone page | off | — |
| `preview-diagnostics` | Shows the preview timing panel | off | — |
| `timings` | Logs pagination frame timings | off | — |
| `restoreLastWorkspace` | Restores the last workspace on boot | off | — |

## Known gaps

- WebKit has not been run, so G1's cross-browser criteria are open. Firefox is out of scope.
- The draft-durability matrix (IndexedDB behaviour under lifecycle events) has not
  been run on any browser other than Chromium.
- `scripts/profile-preview.mjs` still calls `compileMarkdown` with the old
  signature. It has not been run since the compiler's signature changed.
- The typing harness dispatches transactions directly, so it does not measure
  input-to-paint latency for real keystrokes.
- All numbers come from one machine, with one or three samples. Variance has not
  been estimated.

## Reproduce

```
CLEAR_WRITER_BROWSER=<chrome> node scripts/profile-pagination.mjs --scale --pages 1000 --samples 1 --output <file>
CLEAR_WRITER_BROWSER=<chrome> CLEAR_WRITER_SMOKE_FIXTURE=editor-typing-bench CLEAR_WRITER_SMOKE_OUTPUT=<file> node scripts/release-browser-smoke.mjs
```
