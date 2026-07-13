# Technology Stack And Development Model

This page describes the technologies, frameworks, plugins, and runtime boundaries used to develop Clear Writer.

## Language And Tooling

- TypeScript is used for application, platform, compiler, editor, preview, and test-fixture code.
- Vite provides the development server, production bundling, dynamic chunk loading, and web preview server.
- Node.js provides the test runner, build scripts, profiling scripts, and dependency tooling.
- The project uses native ES modules and TypeScript bundler resolution.

## Application Runtime

Clear Writer is a browser/PWA application. It does not use Electron, a desktop shell, IPC, or a preload bridge.

- `src/main.ts` selects normal application boot or the `?export-frame=true` isolated PDF-pagination frame; the legacy worker entry remains available for the browser transport contract.
- `src/boot/app.ts` creates the application shell and connects platform, editor, preview, settings, storage, export, and lifecycle services.
- `public/manifest.webmanifest` defines the installable PWA metadata.
- `public/sw.js` provides the production service worker and prunes obsolete hashed assets while preserving the current shell and referenced resources.
- Browser storage uses OPFS, IndexedDB catalogues, Blob URLs, and browser persistence APIs.
- Local-folder projects use the File System Access API when `showDirectoryPicker` is available.
- Special headings, TOC, section visibility, and other document controls are configured through project settings and rendered into both preview and export flows.

## Editor And UI Frameworks

- CodeMirror 6 provides the Markdown editor, history, search, autocomplete, syntax highlighting, folding, selections, and editor compartments.
- `@codemirror/lang-markdown` and Lezer provide Markdown parsing and syntax support.
- The UI is built with TypeScript DOM components and CSS. There is no React, Vue, Angular, or other component framework.
- `@fontsource/inter` and `@fontsource/inter-tight` provide bundled interface fonts.
- `morphdom` is available for DOM patching where incremental updates are needed.

## Markdown And Document Pipeline

Markdown is compiled through the Unified ecosystem:

- `remark-parse` parses Markdown.
- `remark-gfm` adds GitHub-Flavored Markdown features.
- `remark-rehype` converts the Markdown tree to HTML.
- `rehype-raw` supports approved raw HTML input.
- `rehype-sanitize` sanitizes raw HTML before rendering.
- `rehype-stringify` serializes the final HTML.
- `unist-util-visit` supports custom compiler transformations.

Clear Writer adds compiler plugins for images, metadata, custom inline styles, custom block styles, list markers, tables, table-of-contents placeholders, and image attributes. Quote-style glyph handling is a separate custom-block path, not part of the general image transforms.

## Preview And Export

- Paged.js provides live paginated preview rendering and page layout.
- Paged.js is pinned to `0.4.3` and receives a committed `patches/pagedjs+0.4.3.patch` through `patch-package`. `npm run test:pagedjs-patch` verifies that the expected DOM helpers and null guards are present after installation.
- PDF export uses the browser print API. `BrowserExportService` prefers a hidden iframe and falls back to a popup when required.
- `docx` provides the DOCX conversion implementation. DOCX is present in source, but the active browser runtime disables it and the UI marks the button unavailable.

## Storage Architecture

The platform layer separates application behavior from storage and browser capabilities through `Platform`, `WorkspaceRepository`, and `WorkspaceSession` contracts.

- `InMemoryWorkspace` supports tests and worker-oriented browser transport.
- `OPFSWorkspace` stores browser projects in the Origin Private File System.
- `LocalDirectoryWorkspace` stores projects in user-selected local folders.

Section and folder mutations use the shared `src/platform/mutation-coordinator.ts`.
Because browser filesystem handles do not provide a transaction spanning files and
`settings.json`, the coordinator applies compensating rollback: it snapshots
settings, performs the adapter-specific filesystem operation, writes the planned
metadata update, and restores both sides when a later phase fails. The adapters
retain only handle-specific operations such as copy, delete, and settings writes.

Document activation exposes an explicit readiness boundary through
`EditorManager.whenDocumentReady(path)`. The editor session restores selection
and scroll state after the matching preview render and layout frame complete, so
browser smoke checks and UI callers do not need to infer readiness from a DOM
element appearing during an intermediate render.

Preview CSS is organized by responsibility under `src/preview/css/`: page
layout, typography, lists, and tables each have a focused generator. The
`CssGenerator.ts` remains a small compatibility re-export facade for stable
imports, while new CSS implementations live under `src/preview/css/`. Editor save-status rendering is isolated in
`src/ui/EditorStatusController.ts` while `EditorManager` continues to provide
the application-facing facade.

Durable editor flushing is isolated in `src/ui/EditorSaveCoordinator.ts`.
`EditorManager` delegates flush, navigation-preparation, and save-state queries
to this controller while retaining its existing public facade for application
callers.

Document activation scheduling is isolated in
`src/ui/DocumentActivationCoordinator.ts`. It owns coalesced selection changes,
serialized explicit navigation, stale activation checks, and the
`whenDocumentReady(path)` wait boundary. Rendering remains injected from the
facade during the incremental extraction so editor behavior stays stable.

The closed-project surface is isolated in `src/ui/WelcomeController.ts`. It
owns welcome markup, recent workspace lookup, and the New/Open action bridges;
`EditorManager` retains only session cleanup and preview reset around it.

PDF export orchestration is isolated in `src/ui/ExportOrchestrationController.ts`.
It coordinates durable snapshot compilation, background iframe pagination,
stale-render retry, printable-page validation, and telemetry. The editor manager
continues to expose the existing `compilePaginatedExportSnapshot()` facade.

PDF pagination is intentionally isolated from the visible preview. The
`BackgroundExportPaginator` creates a hidden same-origin iframe, loads the
minimal export frame, sends it the compiled snapshot, and receives paginated
HTML over `postMessage`. This prevents an export render from replacing or
disturbing the document the user is currently viewing.
- `project-paths.ts` centralizes section/image path resolution and settings-path migration shared by all workspace adapters. Glyph paths are handled separately by the custom block glyph helpers.
- `BlobUrlAssetResolver` resolves project images for preview and export. Glyph lookup uses the custom block glyph resolver helpers.

## State And Persistence

- `src/state.ts` owns immutable application snapshots and typed state events.
- CodeMirror changes pass through `DocumentSaveCoordinator` for debounced, serialized persistence.
- `DraftRecoveryStore` provides local draft recovery when durable persistence has not completed.
- Project settings are normalized, migrated, validated, and persisted through the settings services.
- Navigation, project switching, close-project, export, and window-close paths flush pending editor changes before proceeding.

## Testing And Quality Gates

- Tests use Node's built-in `node:test` runner with Vite's SSR module loader for TypeScript modules.
- Unit and contract tests cover compiler behavior, settings migration, storage adapters, export services, editor durability, search, review, and state transitions.
- Browser smoke fixtures run in headless Edge or Chrome against a temporary Vite server.
- Performance tests cover compiler and browser authoring budgets.
- PWA shell smoke validates the production manifest, service worker, and built web shell.
- `npm run release:prep` combines unit, performance, browser, and PWA checks for release validation.

## Development Commands

```text
npm install
npm run dev
npm run typecheck
npm test
npm run test:perf
npm run test:browser-smoke
npm run test:pwa-smoke
npm run build
npm run preview
```

The development server uses `http://127.0.0.1:5274/` by default. The port can move if another process already owns it.
