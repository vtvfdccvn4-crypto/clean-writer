# Technology Stack And Development Model

This page describes the technologies, frameworks, plugins, and runtime boundaries used to develop Clear Writer.

## Language And Tooling

- TypeScript is used for application, platform, compiler, editor, preview, and test-fixture code.
- Vite provides the development server, production bundling, dynamic chunk loading, and web preview server.
- Node.js provides the test runner, build scripts, profiling scripts, and dependency tooling.
- The project uses native ES modules and TypeScript bundler resolution.

## Application Runtime

Clear Writer is a browser/PWA application. It does not use Electron, a desktop shell, IPC, or a preload bridge.

- `src/main.ts` selects normal application boot or the `?pdf-preview=true` isolated PDF-preview frame.
- `src/boot/app.ts` creates the application shell and connects platform, editor, preview, settings, storage, export, and lifecycle services.
- `public/manifest.webmanifest` defines the installable PWA metadata.
- `public/sw.js` provides the production service worker and prunes obsolete hashed assets while preserving the current shell and referenced resources.
- Browser storage uses OPFS, IndexedDB catalogues, Blob URLs, and browser persistence APIs.
- Local-folder projects use the File System Access API when `showDirectoryPicker` is available.
- Special headings, TOC, section visibility, and other document controls are configured through project settings and rendered into both preview and export flows.

## Editor And UI Frameworks

- CodeMirror 6 provides the Markdown editor, history, search, autocomplete, syntax highlighting, folding, selections, and editor compartments.
- `@codemirror/lang-markdown` and Lezer provide Markdown parsing and syntax support.
- Editor behavior is split between CodeMirror compartments and small command helpers: the Markdown toolbar and the `*` selection-wrapping shortcut reuse `src/editor/markdown-commands.ts`, while `src/editor/extensions/editorBehavior.ts` owns editor preferences such as line numbers, matching-text highlight, bracket matching, and rectangular selection.
- The UI is built with TypeScript DOM components and CSS. There is no React, Vue, Angular, or other component framework.
- `@fontsource/inter` and `@fontsource/inter-tight` provide bundled interface fonts.
- Material Symbols and Font Awesome provide the current icon assets; shared icon and toolbar-button markup is centralized in `src/ui/components/icon.ts` and `src/ui/components/toolbarButton.ts`.
- DOM updates use focused TypeScript controllers and the existing preview/rendering boundaries; there is no general-purpose DOM morphing dependency.

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

The compiler never reads application state. Settings that change compiled output (custom styles, custom block styles, special headings, project metadata, and paragraph spacing) travel as a `DocumentCompileSettings` value from `src/compiler/settings.ts`: callers build it with `documentCompileSettings(state.current)` and pass it to `compileMarkdown` or `compilePreviewDocument`, which hand it to the plugins as options. The live preview compiles the whole document each time, so a settings change cannot leave a block compiled under older settings.

## Preview And Export

- Paged.js provides live paginated preview rendering and page layout.
- Paged.js is pinned to `0.4.3` and receives a committed `patches/pagedjs+0.4.3.patch` through `patch-package`. `npm run test:pagedjs-patch` verifies that the expected DOM helpers and null guards are present after installation.
- PDF Preview uses the browser print API through the isolated preview pipeline.

## Storage Architecture

The platform layer separates application behavior from storage and browser capabilities through `Platform`, `WorkspaceRepository`, and `WorkspaceSession` contracts.

- `InMemoryWorkspace` supports workspace tests. It runs the shared `AbstractWorkspaceSession` over the in-memory file-system handles in `src/platform/MemoryFileSystem.ts`, so its `sections/` and `images/` paths and its mutation code are the same as the real adapters'.
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

Preview CSS is organized by responsibility under `src/preview/css/`:
typography, lists, and document features each have a focused generator.
Print and PDF-artifact CSS is compiled separately by
`src/print/PrintCssCompiler.ts`, which shares its style primitives with the
preview generators through `src/styles/`. The former `CssGenerator.ts`
re-export facade and `src/preview/css/page-css.ts` were removed on
2026-10-15. `src/ui/EditorStatusController.ts` owns the save-status badge and
the workspace status bar (active section label, word, line and character
counts, reading time, and caret position), while `EditorManager` continues to
provide the application-facing facade.

Durable editor flushing is isolated in `src/ui/EditorSaveCoordinator.ts`.
`EditorManager` delegates flush, navigation-preparation, and save-state queries
to this controller while retaining its existing public facade for application
callers.

Document activation scheduling is isolated in
`src/ui/DocumentActivationCoordinator.ts`. It owns coalesced selection changes,
serialized explicit navigation, stale activation checks, and the
`whenDocumentReady(path)` wait boundary. Rendering remains injected from the
facade during the incremental extraction so editor behavior stays stable.

The preview objects are built by `src/ui/PreviewPipeline.ts` in dependency
order: `PreviewCoordinator`, then `PaginatedPreviewRenderer` (which owns its
`PageGuideCoordinator`), then `DocumentRenderCoordinator`. Each receives only
objects that already exist. The last compiled single-document preview and
`captureCurrentPrintLayout()` live in `src/ui/CompiledPreviewCache.ts`, so the
two renderers share them without referencing each other.

Autosave writes are not tied to the open document. A save that has started
always writes the file and session it captured, even when a flush runs after
selection has moved to another section or the project has closed; only the
preview refresh and status bar wait for the document to be open. Every
successful write clears that file's recovery draft and records its saved marker.

The preview feature generators in `src/preview/css/document-features-css.ts`
are shared by live and paginated output, with separate options for page breaks
and TOC page counters. `src/ui/styles/buttons.css` owns shared button variants,
and `src/ui/styles/global-defaults.css` owns application UI tokens; the
`npm run check:styles` contract test guards those boundaries.

The closed-project surface is isolated in `src/ui/WelcomeController.ts`. It
owns welcome markup, recent workspace lookup, and the New/Open action bridges;
`EditorManager` retains only session cleanup and preview reset around it.

PDF Preview orchestration is isolated in `src/pdf-preview/IsolatedPdfPreviewPipeline.ts`.
The editor manager uses `EditorManager.compilePdfPreviewInput()` to capture its
immutable input.

All physical-page pagination uses the isolated same-origin frame protocol. The
parent sends an immutable print job through `IsolatedPaginationHost`, receives
the paginated artifact over `postMessage`, and commits it only if the request
is still current. The editor shares one host between visible full-document
preview and page-break guide pagination, serializing competing Paged.js jobs
and guaranteeing iframe cleanup. The editor's host frame is released when a
project closes and prewarmed again when one opens. The standalone PDF preview
pipeline retains its own host because it has a separate print-window lifecycle.

`src/print/PrintDocumentCompiler.ts` normalises logical page breaks,
`src/print/PrintCssCompiler.ts` creates the frozen print stylesheet, and the
isolated frame runs Paged.js before returning headers, footers, and page
content. `IsolatedPaginationHost` supplies size-aware budgets, cancellation,
progress diagnostics, and stale-result protection.
- `project-paths.ts` centralizes section/image path resolution and settings-path migration shared by all workspace adapters. Glyph paths are handled separately by the custom block glyph helpers.
- `BlobUrlAssetResolver` resolves project images for preview and export. Glyph lookup uses the custom block glyph resolver helpers.

## State And Persistence

- `src/state.ts` owns immutable application snapshots and typed state events. The compiler and preview layers do not import it; they receive the settings they need from their callers.
- `ProjectSessionStore` publishes to the global `state` by default but accepts any `AppState`. `projectServiceFor(appState)` and `settingsServiceFor(appState)` return one service per state, so tests can open projects in an isolated state; `ProjectService` and `SettingsService` remain the instances for the global one.
- Shared data types live in `src/types/` by area (`document-setup.ts`, `editor.ts`, `project.ts`, `app-state.ts`); `src/types/index.ts` re-exports them all.
- CodeMirror changes pass through `DocumentSaveCoordinator` for debounced, serialized persistence.
- `DraftRecoveryStore` provides local draft recovery when durable persistence has not completed. A draft is treated as stale once a later successful save has been recorded.
- Project settings are normalized, migrated, validated, and persisted through the settings services.
- Navigation, project switching, close-project, export, and window-close paths flush pending editor changes before proceeding.

## Testing And Quality Gates

- Tests use Node's built-in `node:test` runner with Vite's SSR module loader for TypeScript modules.
- Unit and contract tests cover compiler behavior, settings migration, storage adapters, export services, editor durability, search, review, and state transitions.
- Browser smoke fixtures run in headless Edge or Chrome against a temporary Vite server. CI runs them before every deploy. The browser launch helpers are shared in `scripts/lib/browser.mjs`, and fixtures that wait on rendering report the app's state when they time out.
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
