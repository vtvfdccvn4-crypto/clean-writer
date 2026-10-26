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

### Real keyboard input (1,000 pages, one section, 200 keystrokes after 20 warm-up)

Keys are sent as trusted key events over the DevTools protocol
(`scripts/typing-input-latency.mjs`), so they go through the browser's input
pipeline. Latency is from the input event to the animation frame that shows it.

| Run | Frame latency p50 | p95 | max | Event Timing (≥16 ms) p95 | max | Long tasks |
|---|---|---|---|---|---|---|
| 1 | 15.1 ms | 16.7 ms | 35.9 ms | 24 ms | 32 ms | 0 |
| 2 | 15.1 ms | 15.8 ms | 23.5 ms | 16 ms | 24 ms | 0 |
| 3 | 15.0 ms | 15.7 ms | 17.3 ms | 16 ms | 24 ms | 0 |

All three runs pass the plan's typing gates: no long task over 50 ms, and p95 latency
under 100 ms. The p95 INP gate has room: the slowest Event Timing entry was 32 ms.
The runs are on one headless machine, so they are a baseline, not the gate.

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

### Repeated pagination (one host and frame, 300 pages, forced GC between runs)

The app keeps one pagination host, and its frame, across jobs, so this check runs
every job on one host. The browser's garbage collector runs before and after each
job, so heap readings are taken after collection.

| Check | 10 runs | 30 runs |
|---|---|---|
| Jobs succeeded | 10 / 10 | 30 / 30 |
| Frames in the page after each run | 1 (same frame every run) | 1 (same frame every run) |
| `<style>` elements in the frame after each run | 0 | 0 |
| Paged.js pages left in the frame after each run | 0 | 0 |
| Heap after GC, run 1 | 9.93 MB | 9.93 MB |
| Heap after GC, run 10 | 10.56 MB (+6.3%) | 10.57 MB (+6.4%) |
| Heap after GC, run 15 / run 30 | — | 10.61 MB / 10.63 MB (+7.1% at run 30) |

The heap rises by about 0.6 MB over the first 10 runs, then holds at about
10.6 MB from run 15 to run 30 (under 0.2% change). That pattern looks like a one-time
warm-up step, not a per-run leak.

**Gate baseline (set):** run 1 is cold, because it creates the frame and loads
Paged.js. The baseline is therefore run 2, the first warm run, and the window is
runs 2 to 10. Growth in that window is **4.8%**, under the 5% limit, so the gate
passes. The profiler computes it as `heapGate` in the output. Measured from run 1 the
figure would be 6.3%, but run 1 is excluded by definition. Over 30 runs the heap
levels off at about 5.5% above run 2, so the gate is close to its limit and should
be watched when the pagination code changes.

The style check reads the frame after each job returns. It does not sample the
frame during pagination, so it shows that the cleanup happens, not how many styles
exist at the peak.

### Realistic corpus (one section of typing-corpus pages, source size and compile)

Compile is in Node (`compileMarkdown`); pagination is in headless Chromium, three samples,
median. Sizes are the number of pages in the corpus's one section; printed pages differ
(the 1,000-page corpus prints as 467 pages).

| Corpus pages | Source characters | Printed pages | Compile | Paginate (median) | Total |
|---|---|---|---|---|---|
| 50 | 109,925 | 24 | 0.46 s | 0.31 s | 0.8 s |
| 100 | 219,861 | 47 | 0.62 s | 0.67 s | 1.3 s |
| 200 | 439,831 | 94 | 1.04 s | 0.92 s | 2.0 s |
| 400 | 879,771 | 187 | 1.97 s | 1.90 s | 3.9 s |
| 600 | 1,319,711 | 280 | 3.57 s | 3.20 s | 6.8 s |
| 1,000 | 2,199,592 | 467 | 4.36 s | 7.50 s | 11.9 s |

The large-document threshold (`src/preview/PreviewPolicy.ts`) is 400,000 characters,
just under the point where compile plus pagination reaches about 2 s.

### Content containment (B15, 1,000 pages, not shipped)

`preview-containment-bench` (`CLEAR_WRITER_SMOKE_QUERY` with `surface=live|pages` and
`contain=off|on|exact`). Results are for headless Chromium on one machine.

| Surface | Variant | Layout or render | First frame | Scroll p95 | Verdict |
|---|---|---|---|---|---|
| Live blocks (4,100) | none | 1.9 s (render 0.6 + layout 1.3) | 1.95 s | 16.8 ms | baseline |
| Live blocks | `on`, guessed heights | 0.14 s | 2.4 s | 33.4 ms | wrong total height (2.46 M px); rejected |
| Live blocks | `exact` heights | 0.2 s | 2.0 s | 33.4 ms | scroll worse; rejected |
| Pages (572) | none | 0.16 s layout | 2.9 s | 16.8 ms | baseline |
| Pages | `on` | 0.003 s layout | 0.12 s | 16.7 ms | faster, but first-block click-to-source failed in 3 of 6 runs; rejected |

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
- All numbers come from one machine, with one or three samples. Variance has not
  been estimated.

## Reproduce

```
CLEAR_WRITER_BROWSER=<chrome> node scripts/profile-pagination.mjs --scale --pages 1000 --samples 1 --output <file>
CLEAR_WRITER_BROWSER=<chrome> CLEAR_WRITER_SMOKE_FIXTURE=editor-typing-bench CLEAR_WRITER_SMOKE_OUTPUT=<file> node scripts/release-browser-smoke.mjs
```
