# Technology Stack And Development Model

This page describes the technologies, frameworks, plugins, and runtime boundaries used to develop Clear Writer.

## Language And Tooling

- TypeScript is used for application, platform, compiler, editor, preview, and test-fixture code.
- Vite provides the development server, production bundling, dynamic chunk loading, and web preview server.
- Node.js provides the test runner, build scripts, profiling scripts, and dependency tooling.
- The project uses native ES modules and TypeScript bundler resolution.

## Application Runtime

Clear Writer is a browser/PWA application. It does not use Electron, a desktop shell, IPC, or a preload bridge.

- `src/main.ts` selects the normal application boot or the `?worker=true` pagination boot.
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
- A small postinstall patch adds null guards to the installed Paged.js DOM helpers. `patch-pagedjs.js` validates that the expected functions and guards are present after installation.
- PDF export uses the browser print API. `BrowserExportService` prefers a hidden iframe and falls back to a popup when required.
- `docx` provides the DOCX conversion implementation. DOCX is present in source, but the active browser runtime disables it and the UI marks the button unavailable.

## Storage Architecture

The platform layer separates application behavior from storage and browser capabilities through `Platform`, `WorkspaceRepository`, and `WorkspaceSession` contracts.

- `InMemoryWorkspace` supports tests and worker-oriented browser transport.
- `OPFSWorkspace` stores browser projects in the Origin Private File System.
- `LocalDirectoryWorkspace` stores projects in user-selected local folders.
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
