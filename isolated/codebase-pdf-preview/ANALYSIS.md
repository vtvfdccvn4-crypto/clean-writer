# Extraction analysis

## Reviewed path

The current application path starts in `src/boot/setupPdfPreview.ts`, captures a durable snapshot through `EditorManager`, compiles print HTML and CSS, sends an immutable job to `IsolatedPaginationHost`, runs one Paged.js pass in `pdf-preview-frame.ts`, serializes a `PdfArtifact`, and installs that artifact in `PdfPreviewPrintTarget`.

The earlier `isolated/pdf-render-pipeline` extraction was also reviewed. It already removes application metadata and introduces hashed identities, portable frame URLs, artifact validation, a bounded cache, and extension hooks. This package retains those successful boundaries and focuses specifically on rendering plain/codebase text.

## Redundancy and risk removed

| Previous shape | Extracted shape |
| --- | --- |
| Full document, CSS, margin, and asset strings repeated inside the artifact cache key | One 64-character SHA-256 render ID covers all render inputs |
| Ready, progress, and result traffic all share global `window.message` listeners | One exact-origin connection transfers a private `MessagePort`; request traffic stays on that port |
| Separate polling timer repeatedly scans every page during pagination | `MutationObserver` reports only when Paged.js changes the page tree |
| One new `MessageChannel` is allocated for each hidden-frame queue tick | One reusable channel schedules the whole pagination pass |
| Failure responses fabricate an empty artifact that violates artifact invariants | Failure responses contain an error and no artifact |
| App route, DOM IDs, settings, metadata, margin renderers, list renderers, TOC renderers, and editor services travel with the PDF feature | The extraction starts at safe text or trusted HTML/CSS and exposes optional renderer hooks |
| Print and preview consumers can accidentally repaginate content | Both consumers install the exact immutable artifact DOM and stylesheet |
| Arbitrary extension identity values are silently stringified | Identity input accepts only finite JSON data, sorts object keys, and rejects cycles and unsupported prototypes |
| The generic extraction requires consumers to construct trusted HTML | `compileTextBundle()` escapes source text and supplies a polished code-oriented print layout |

## Organization

- `text-bundle.ts`: safe source-text compiler and layout CSS.
- `model.ts`: render identity, artifact validation/freezing, budget, and bounded LRU cache.
- `protocol.ts`: all transport validation in one place.
- `frame-runtime.ts`: private-channel endpoint, one Paged.js pass, progress observation, and artifact creation.
- `host.ts`: disposable frame lifecycle, cancellation, timeouts, exact-origin connection, and ownership validation.
- `view.ts`: artifact mounting and browser print target.
- `pipeline.ts`: small cached facade.

## Deliberate exclusions

- Markdown parsing, application settings, project storage, UI notices, and editor lifecycle.
- Direct PDF byte encoding, uploads, and persistence.
- Syntax highlighting that would require a second parser and theme dependency. The output preserves source exactly and labels languages without mutating tokens.
- Hostile-script sandboxing. Lower-level HTML jobs are a trusted compiler boundary; plain text should use `compileTextBundle()`.

## Compatibility

The renderer targets modern browsers with modules, Web Crypto, `MessageChannel`, `MutationObserver`, `AbortSignal`, blob URLs, and Paged.js 0.4.3. As with the application, representative documents should be rechecked before upgrading Paged.js or removing the repository's null-guard patch.
