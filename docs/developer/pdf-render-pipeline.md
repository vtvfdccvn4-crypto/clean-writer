# PDF Render Pipeline: Review, Extraction, and Reuse Guide

## Purpose and scope

This document describes the complete Clear Writer browser PDF-preview path as reviewed on 2026-08-23, defines the boundary of the extracted implementation in this folder, and explains how to reuse and extend it elsewhere.

The workflow is a browser print pipeline. It does not encode PDF bytes. It compiles content into physical Paged.js page DOM, freezes that result as an immutable artifact, installs the artifact in a separate window, and invokes `window.print()`. The browser or operating system produces the final PDF when the user chooses Save as PDF.

The extracted implementation is intentionally not integrated with Clear Writer. No file in this package imports the application source tree, and no application file imports this package.

## Reviewed Clear Writer workflow

### 1. Authoring and durable source capture

The UI entry is `src/boot/setupPdfPreview.ts`. It reacts to the PDF Preview button, opens a print window while the user gesture is still active, and asks `EditorManager` for a frozen PDF job. Opening the target before asynchronous pagination is necessary because browsers block popups created after the click activation expires.

`src/ui/editor-manager.ts` first flushes pending editor changes and compiles a durable source snapshot. This keeps unsaved transient DOM out of the print boundary. The visible live preview is not scraped for printing.

### 2. Print-specific compilation

`src/pdf-preview/PdfPreviewJobFactory.ts` delegates to `PdfRenderSnapshot.ts`. The snapshot composes:

- `PrintDocumentCompiler.ts`, which transforms compiled document HTML into print semantics and explicit break markers;
- `PrintCssCompiler.ts`, which freezes page geometry, typography, list, table, image, TOC, and print-only artifact rules;
- header/footer rows and project metadata;
- resolved margin image URLs;
- list-marker inputs that must be materialized before pagination.

The result is treated as immutable. Every mutable input needed for the physical pages is captured before the renderer frame starts.

### 3. Artifact reuse

`PreviewController.ts` and `PdfArtifactStore.ts` cache the latest completed artifact. A print request can reuse it only when its render key matches the newly captured job. This avoids a second Paged.js pass when the exact paginated preview is already available.

### 4. Parent-side orchestration

On a cache miss, `IsolatedPdfPreviewPipeline.ts` delegates to `IsolatedPaginationHost.ts`. The host:

1. estimates document size and a bounded timeout;
2. creates a same-origin, off-screen iframe;
3. waits for a version-specific ready message;
4. sends the immutable job with a random request ID;
5. relays progress and supports `AbortSignal` cancellation;
6. validates the result source, origin, request ID, and terminal state;
7. removes the iframe in a `finally` block;
8. records bounded, content-free diagnostics.

Requests are serialized in the current host so two Paged.js runs do not overlap within one host instance.

### 5. Renderer boot route and protocol

`src/main.ts` detects `?pdf-preview=true` and lazily imports `src/boot/pdf-preview-frame.ts`. That module empties the frame body, installs a dedicated stage, accepts same-origin protocol messages, and returns progress or a completed artifact.

Although the route is runtime-isolated, it is still coupled to the Clear Writer application bundle, index page, message names, types, and feature modules. That distinction motivated this extraction.

### 6. The single Paged.js pass

`PdfPreviewFramePaginator.ts` constructs a Paged.js `Previewer`, installs trusted HTML into a detached article, supplies print CSS through a blob URL, and paginates into the stage. It periodically reports the number of `.pagedjs_page` nodes.

The app replaces the Paged.js queue tick with a `MessageChannel` scheduler when the internal queue shape exists. Off-screen frames can have `requestAnimationFrame` throttled; the replacement prevents long jobs from stalling and avoids nested timer clamping. This is a guarded dependency on Paged.js internals.

Before pagination, Clear Writer materializes custom list-marker text and reserves four characters for TOC page numbers. After pagination, it resolves TOC links to physical page numbers and writes every page's header/footer content. Page-dependent values must be materialized before serialization, because the print window does not run those transforms again.

The frame captures the input stylesheet plus Paged.js-generated styles. Artifact-only CSS is appended so physical page geometry and print presentation travel with the page DOM.

### 7. Immutable artifact boundary

`PdfArtifact.ts` validates schema version, identity, non-empty HTML/CSS, page count, and page metadata, then freezes the object and nested page list. `PdfArtifactRenderer.ts` is the only shared boundary that turns artifact strings back into DOM.

The message transport structured-clones data and removes JavaScript immutability, so the parent validates and freezes the artifact again after receipt.

### 8. Print target

`PdfPreviewPrintTarget.ts` replaces the preparing document with the artifact HTML and CSS, waits for fonts and images with a safety timeout, focuses the popup, and invokes `print()`. It listens for `afterprint` and closes the target. The printed page tree is therefore the same tree that was previewed and validated, not a second pagination attempt.

### 9. Diagnostics and validation currently present

The current code has adaptive budgets, cancellation, progress, artifact validation, bounded local diagnostics, page timing instrumentation, scale profiles, and a browser `pdf-visual` smoke fixture. Unit tests also enforce several architectural contracts. The user documentation in `docs/user/exporting.md` is stale where it still says cancellation, budgets, artifact validation, diagnostics, and large-document gates are pending.

The repository uses `pagedjs@0.4.3` plus `patches/pagedjs+0.4.3.patch`. The patch adds null guards in Paged.js DOM traversal. Any reuse that retains this exact version should either carry and verify the patch or prove that the target documents do not trigger those failures.

## Review findings

### Strengths retained in the extraction

- One immutable snapshot feeds one Paged.js pass.
- Pagination runs in a disposable browsing context, separate from visible preview state.
- Exact origin, event source, protocol version, and request identity are checked.
- The finished page DOM and generated CSS travel together as one artifact.
- Popup creation remains separate and synchronous.
- Abort, startup timeout, render timeout, progress, and content-free diagnostics are first-class.
- Page-dependent extensions run before artifact serialization.

### Coupling removed

- App-level metadata, page setup, list styles, and image resolvers.
- `PrintDocumentCompiler` and `PrintCssCompiler` imports.
- Clear Writer message names, DOM IDs, storage keys, UI notices, and editor services.
- The `index.html?pdf-preview=true` application route.
- Assumptions about TOC, margin, list-marker, and navigation selectors.

The extracted input starts at trusted, asset-resolved HTML/CSS. An adopter can keep its own Markdown compiler and design system outside the pagination package.

### Improvements implemented in the isolated code

1. **Compact identity.** The app render key contains complete document, stylesheet, margin, and asset strings. Those strings are cloned into the frame and echoed in the artifact. The extraction uses one stable SHA-256 render ID covering HTML, CSS, artifact CSS, protocol version, and caller-supplied extension identity.
2. **Portable frame URL.** The host accepts an explicit renderer page URL instead of deriving an app route from `import.meta.url` and environment flags.
3. **Cross-origin safety.** Same-origin is the default. Cross-origin rendering is rejected unless explicitly enabled, and all messaging still uses an exact origin rather than `*`.
4. **Protocol validation.** Ready, request, progress, and result messages carry an explicit protocol version. Malformed messages and artifacts are rejected at ownership boundaries.
5. **No invalid error artifact.** Frame failures return an error without fabricating an artifact that violates the artifact schema.
6. **Stable settlement.** Frame startup and render promises have explicit settled guards and always detach timers and listeners.
7. **Per-pass CSS collection.** Only Paged.js styles created by the current pass are captured, preventing stale generated rules if a renderer frame is reused.
8. **True frame independence.** Every host request owns its own frame, so independent requests may run concurrently without sharing a Paged.js document. Resource limits remain the caller's responsibility.
9. **Configurable resource wait.** Print resource timeout, settle delay, title, popup features, and close behavior are public options.
10. **Bounded LRU cache.** `PdfArtifactCache` supports several reusable artifacts instead of one app-specific slot.
11. **Extension hooks.** `prepareSource`, `finalizePages`, and `pageAnchor` live only in the renderer bundle. They can implement product-specific TOC, running headers, list markers, or accessibility transforms without making those models part of the transport contract.
12. **Budget hardening.** Script and style bodies do not inflate text-based page estimates, and timeout bounds are validated.

## Extracted architecture

```text
Application compiler
  -> trusted absolute-asset HTML + print CSS + extension identity
  -> createPdfRenderJob() [immutable input + SHA-256 renderId]
  -> IsolatedPaginationHost
       -> disposable renderer iframe
            -> bootPdfRendererFrame()
            -> prepareSource hook
            -> Paged.js pass
            -> finalizePages hook
            -> immutable PdfArtifact
       <- versioned exact-origin result
  -> optional PdfArtifactCache
  -> preview DOM or PdfPrintTarget
  -> browser print dialog
  -> user saves PDF bytes
```

## Public modules

| Module | Responsibility |
| --- | --- |
| `job.ts` | Validate input, canonicalize extension identity, compute SHA-256 render identity. |
| `budget.ts` | Estimate page count and bounded render timeout without retaining content. |
| `host.ts` | Disposable iframe lifecycle, exact-origin protocol, aborts, timeouts, diagnostics. |
| `frame-runtime.ts` | Renderer message endpoint and extension hooks. |
| `paginator.ts` | Single Paged.js pass, generated-CSS capture, hidden-frame scheduler. |
| `artifact.ts` | Artifact validation, deep freeze, and DOM installation boundary. |
| `cache.ts` | Small render-ID-keyed LRU artifact cache. |
| `print-target.ts` | Popup preparation, resource readiness, artifact installation, printing. |
| `pipeline.ts` | Optional high-level paginate and paginate-then-print facade. |
| `contracts.ts` | Serializable jobs, artifacts, messages, progress, and outcomes. |

## Integration workflow

### Build the renderer page

Bundle `examples/renderer.html` and `renderer-entry.ts` as an addressable page. It must load `pagedjs` and call `bootPdfRendererFrame()` exactly once. Host and frame must use the same package/protocol version.

Product-specific code belongs in renderer-only hooks:

```ts
bootPdfRendererFrame({
  prepareSource(source, job) {
    // Reserve TOC widths or materialize custom counters before pagination.
  },
  finalizePages(stage, job) {
    // Resolve page-number links and running headers before serialization.
  },
  pageAnchor(page) {
    return page.querySelector('[data-section-id]')?.getAttribute('data-section-id') ?? undefined;
  }
});
```

If hooks depend on configuration, include the serializable configuration in `extensionIdentity` when creating the job. The current minimal transport does not send arbitrary extension data; an adopter can extend `PdfRenderJob` if hooks need values rather than only identity invalidation.

### Prepare a job

Sanitize raw HTML before this boundary. Resolve relative image, font, and stylesheet references to absolute URLs, data URLs, or blob URLs that the renderer frame can load. Then:

```ts
const job = await createPdfRenderJob({
  html: compiledHtml,
  css: printCss,
  artifactCss: physicalPagePrintCss,
  extensionIdentity: { templateVersion, header, footer }
});
```

Job creation is asynchronous because Web Crypto computes SHA-256. A change to any render input produces a different `renderId`.

### Paginate without printing

```ts
const pipeline = new PdfRenderPipeline({
  frameUrl: new URL('./renderer.html', import.meta.url),
  onDiagnostic: outcome => telemetry.record(outcome)
});
const outcome = await pipeline.paginate(job, updateProgress, abortController.signal);
if (outcome.status === 'success') cache.set(outcome.artifact);
```

Render `outcome.artifact` in a preview document using `renderPdfArtifactContent()` and `createPdfArtifactStyle()`.

### Print

Open the target directly in the click handler, before awaiting job creation or pagination:

```ts
const target = PdfPrintTarget.open({ title: documentTitle });
if (!target) throw new Error('Popup blocked');
const result = await pipeline.paginateAndPrint(job, target, updateProgress, signal);
```

If an exact cached artifact exists, call `target.print(artifact)` and skip pagination.

## Extension order and invariants

The safe order is fixed:

1. compile and sanitize;
2. resolve assets;
3. freeze job identity;
4. install source in the frame;
5. run `prepareSource`;
6. run Paged.js exactly once;
7. run `finalizePages`;
8. collect page metadata and generated CSS;
9. validate and freeze artifact;
10. transfer and re-freeze artifact;
11. install artifact without repagination;
12. wait for resources and print.

Do not change content geometry after step 6. A finalize hook may replace reserved-width text or fill margin boxes, but it must not introduce reflow. If it can affect layout, move it into `prepareSource` and let Paged.js see it.

## Security and privacy

- `innerHTML` is intentional at the trusted compiler boundary. This package is not a sanitizer.
- Never use `postMessage(..., '*')`. Cross-origin frames receive the full document.
- Diagnostic callbacks contain counts, durations, status, and messages, not HTML or CSS. Scrub application error messages before sending them to third-party telemetry.
- Blob and object URLs are process-local capabilities. Revoke source blob URLs only after printing or artifact disposal.
- An iframe isolates DOM and style state; it is not a hostile-code sandbox. Do not put untrusted scripts in job HTML.

## Failure behavior

| Status | Meaning | Caller action |
| --- | --- | --- |
| `success` | Valid immutable artifact returned. | Preview, cache, or print. |
| `cancelled` | Abort signal fired. | Close target or silently stop. |
| `timed-out` | Frame startup or pagination exceeded a bound. | Show retry guidance and log diagnostics. |
| `failed` | Load, protocol, Paged.js, validation, or extension error. | Show the message and retain source state. |

Frames are always removed. Print targets close on pagination failure in the high-level facade and on print installation failure.

## Verification strategy

Run:

```sh
npx tsc -p isolated/pdf-render-pipeline/tsconfig.json --noEmit
npm --prefix isolated/pdf-render-pipeline test
```

The unit suite checks stable identities, artifact invariants, budget bounds, LRU behavior, and the no-app-import rule. Serve the repository with Vite and open `isolated/pdf-render-pipeline/examples/browser-smoke.html`; success proves real iframe messaging and Paged.js page creation.

Before production adoption, add representative visual fixtures and compare rendered screenshots or generated PDFs in the target browsers. Cover long tables, large images, fonts, RTL scripts, CJK, footnotes, forced breaks, blank pages, headers/footers, TOC targets, and documents near the timeout ceiling. A DOM success result alone cannot prove visual fidelity.

## Compatibility notes

- Current peer dependency: `pagedjs@0.4.3`.
- Browser requirements: modules, Web Crypto, `postMessage`, `AbortSignal`, `MessageChannel`, CSS paged media, and popup/print APIs for printing.
- The Paged.js queue accelerator is guarded but touches a private-shaped field. Test it whenever upgrading Paged.js.
- Carry the Clear Writer null-guard patch only if target fixtures demonstrate it is required; do not silently patch a newer Paged.js release.
- The pipeline produces a printable artifact, not a `.pdf` file. Server-side or headless binary generation is a separate adapter.

## Deliberately excluded

- Markdown parsing and document assembly;
- application page/layout settings;
- headers, footers, TOC, or list-marker product models;
- persistent application storage;
- UI notices and editor lifecycle;
- direct PDF byte generation, upload, or download;
- application wiring of any kind.
