# Clear Writer Documentation Map

This document maps the Clear Writer documentation set to the current codebase. It is intended to be the first planning artifact for a fuller user guide, administrator/deployment guide, and developer guide, while still reflecting the features that actually ship today.

## Product Summary

Clear Writer is a browser/PWA Markdown writing app. It uses CodeMirror for source editing, compiles Markdown through a Unified/Remark/Rehype pipeline, renders a live paginated preview through Paged.js, and persists projects either in browser storage or a user-selected local folder. A project is made of Markdown section files, image assets, and a `settings.json` file that controls document layout, styling, metadata, special headings, and editor behavior.

Primary source references:

- `src/main.ts`: application entry point and worker/app boot switch.
- `src/boot/app.ts`: runtime wiring for the app layout, editor, preview, settings, project loading, service worker, and exports.
- `src/ui/components/AppShell.ts`: three-pane application layout.
- `src/ui/components/ProjectExplorer.ts`: project explorer controls and image browser.
- `src/ui/components/EditorPanel.ts`: CodeMirror editor toolbar and document tools.
- `src/ui/components/PreviewPanel.ts`: live preview and export controls.
- `src/types/index.ts`: canonical data types for settings, projects, state, and workspace references.
- `src/config/defaults.ts`: default document, editor, and project settings.

## Recommended Documentation Set

### 1. Product Overview

Audience: new users, evaluators, release notes readers.

Purpose: explain what Clear Writer does, who it is for, and how the main workflow fits together.

Should cover:

- Markdown authoring with a live paginated preview.
- Project-based writing with multiple sections.
- Browser/PWA runtime expectations.
- Export targets: browser PDF; DOCX implementation exists in source but is disabled in the active browser runtime.
- Settings-driven document styling, metadata, and special-heading behavior.
- Browser storage versus local folder projects.

Source map:

- `package.json` for name, description, scripts, and dependencies.
- `src/ui/components/AppShell.ts` for visible application layout.
- `src/boot/app.ts` for initialized features.
- `public/manifest.webmanifest` for PWA metadata.
- `public/sw.js` and `src/sw-registration.ts` for service worker behavior.

Suggested file:

- `docs/user/product-overview.md`

### 2. Getting Started

Audience: first-time users.

Purpose: document the happy path from opening the app to writing and exporting a document.

Should cover:

- Starting the app locally during development with `npm run dev`.
- Building and previewing with `npm run build` and `npm run preview`.
- Creating a new browser project.
- Opening a local folder project where `showDirectoryPicker` is supported.
- Creating folders and Markdown section files.
- Switching between full-document preview and single-section editing.
- Adding images and inserting image references.
- Exporting PDF and recognizing that DOCX is unavailable in the browser runtime.

Source map:

- `package.json` scripts.
- `src/ui/components/ProjectExplorer.ts` for new/open/save/close controls.
- `src/ui/sidebar/SidebarController.ts` and related sidebar files for section/image interactions.
- `src/ui/project-flow-modal.ts` for project creation and opening flow.
- `src/ui/editor-manager.ts` for full-document mode and section editing behavior.
- `src/services/ProjectService.ts` for project operations.

Suggested file:

- `docs/user/getting-started.md`

### 3. User Guide: Workspace And Projects

Audience: document authors.

Purpose: explain how projects are structured and how users work with sections and images.

Should cover:

- Project explorer layout: sections area and images area.
- Section files and folders.
- Creating, renaming, moving, deleting sections.
- Drag/drop or move behavior if exposed by sidebar interactions.
- Page break, header visibility, footer visibility, heading numbering, TOC, and special heading flags.
- Image upload, image preview, and insert-at-cursor behavior.
- Autosave, save state, draft recovery, and navigation safeguards.
- Project health and recovery for malformed or missing `settings.json`.

Source map:

- `src/services/ProjectService.ts`: create, rename, move, delete, section flags, upload image, health checks.
- `src/platform/types.ts`: workspace contract.
- `src/platform/LocalDirectoryWorkspace.ts`: local folder behavior and project health recovery.
- `src/platform/OPFSWorkspace.ts`: browser storage project behavior.
- `src/editor/DraftRecoveryStore.ts`: draft recovery.
- `src/ui/sidebar/*`: visible project tree interactions.
- `src/ui/project-review.ts` and `src/services/project-review.ts`: project review behavior.
- `src/ui/components/SpecialHeadingsDrawer.ts` and `src/ui/special-headings-setup.ts`: special heading controls.

Suggested file:

- `docs/user/projects-and-workspaces.md`

### 4. User Guide: Markdown Editing

Audience: document authors.

Purpose: document the authoring experience and supported Markdown features.

Should cover:

- CodeMirror editor basics.
- Toolbar commands: H1, H2, H3, bold, italic, link, unordered list, ordered list, quote, inline code, code block.
- Find and replace.
- Project-wide search.
- Document outline.
- Symbol picker.
- Word count and reading-time indicator.
- Custom inline style pairs.
- Custom quote/block style prefixes.
- Markdown tables and table style selection.
- Markdown images and HTML image support.
- Special heading directives and preview-time transforms.

Source map:

- `src/ui/components/EditorPanel.ts`: toolbar controls.
- `src/editor/createEditor.ts`: CodeMirror extensions and editor options.
- `src/editor/markdown-commands.ts`: toolbar command behavior.
- `src/editor/writing-statistics.ts`: word count and reading time.
- `src/ui/document-outline.ts`: outline behavior.
- `src/ui/project-search.ts` and `src/services/project-search.ts`: project search.
- `src/ui/symbolPicker.ts`: symbol picker.
- `src/compiler/index.ts`: Markdown compile chain.
- `src/compiler/remark-plugins/*`: custom Markdown transforms.
- `src/compiler/rehype-plugins/*`: post-Markdown HTML transforms.
- `src/preview/specialHeadings.ts`: special heading rendering.

Suggested file:

- `docs/user/markdown-editing.md`

### 5. User Guide: Live Preview

Audience: document authors and template designers.

Purpose: explain how source Markdown becomes the paginated preview.

Should cover:

- Live preview pane.
- Full document preview versus single section preview.
- Revision-aware preview navigation from the editor selection into the committed preview.
- Debounced exact pagination after edits.
- Paged.js pagination.
- Header/footer rendering.
- Heading numbering.
- Table of contents rendering.
- Special heading handling.
- Image resolution and fallbacks.
- Preview diagnostics chip.

Source map:

- `src/preview/PreviewController.ts`: exact render scheduling.
- `src/preview/RenderEngine.ts`: Paged.js render lifecycle.
- `src/preview/PagedJsAdapter.ts`: Paged.js integration.
- `src/preview/PreviewViewport.ts`: responsive preview zoom and viewport controls.
- `src/preview/CssGenerator.ts`: dynamic page, typography, list, and table CSS.
- `src/preview/headingNumbering.ts`: heading numbering transform.
- `src/preview/tableOfContents.ts`: TOC transform.
- `src/preview/specialHeadings.ts`: special heading transform.
- `src/images/imageSources.ts`: image fallback and source resolution.
- `src/perf/preview-metrics.ts`: preview metrics.

Suggested file:

- `docs/user/live-preview.md`
- `docs/developer/preview-navigation.md`

### 6. Settings Reference

Audience: authors, template designers, testers.

Purpose: describe every in-app settings panel and how settings affect preview/export in the browser/PWA UI.

Should cover:

- Page setup:
  - Paper sizes: A4, A5, US Letter, US Legal, B5.
  - Margins in millimeters.
  - Preview guidelines.
  - Header and footer rows with left, center, and right cells.
  - Cell content, font family, size, color, bold, italic, and alignment.
  - `{page}` placeholder and line breaks.
  - Per-section header/footer visibility.
  - Special heading definitions.
- Typography styles:
  - Paragraph and H1-H6 font family, size, color, bold, italic.
  - Line height and top/bottom margins.
- Lists:
  - Separate unordered styles for `*`, `-`, and `+`.
  - Separate ordered styles for `1.` and `1)`.
  - Marker icon/counter style, marker color, spacing, font styles.
- Tables:
  - Table style 1 for regular Markdown tables.
  - Table style 2 when `<!-- table-style: 2 -->` appears immediately before a table.
  - Header, body, alternate row, border, padding, and margins.
- TOC:
  - Section inclusion and heading numbering toggles.
  - Maximum heading depth H1-H6.
  - Per-level TOC font styling and all caps.
- Editor settings:
  - Font size, Markdown token styling, line wrapping, line numbers, folding controls.
  - Active-line highlight, special characters, bracket matching, close brackets, autocompletion, indentation.
  - Multiple selections, rectangular selection, matching-text highlight.
- Custom inline styles:
  - Named opening/closing delimiter pairs.
  - Font overrides for matched inline content.
- Custom quote/block styles:
  - Named prefixes, optional glyphs, font overrides, line height, margins.

Source map:

- `src/config/defaults.ts`: default values.
- `src/types/index.ts`: setting data model.
- `src/ui/components/SettingsDrawer.ts`: tab list.
- `src/ui/components/PageSetupDrawer.ts`: page controls.
- `src/ui/components/TypographyDrawer.ts`: typography controls.
- `src/ui/components/ListsDrawer.ts`: list controls.
- `src/ui/components/TablesDrawer.ts`: table controls.
- `src/ui/components/TocSetupDrawer.ts`: TOC controls.
- `src/ui/components/SpecialHeadingsDrawer.ts`: special heading controls.
- `src/ui/components/EditorSettingsDrawer.ts`: editor controls.
- `src/ui/components/CustomStylesDrawerTemplate.ts`: custom style controls.
- `src/services/SettingsService.ts`: settings persistence.
- `src/services/project-settings.ts`: settings normalization, validation, migration, schema version.

Suggested file:

- `docs/reference/settings.md`

### 7. Project File Format

Audience: advanced users, integrators, developers.

Purpose: document the on-disk/in-browser project shape.

Should cover:

- Project root layout:
  - `settings.json`
  - `sections/`
  - `images/`
- Markdown section file handling.
- Image asset path handling.
- `settings.json` schema version.
- Ordered section list and path-based flags.
- How settings migrate from older aliases.
- Validation ranges and safe defaults.
- Recovery behavior for missing or malformed settings.

Source map:

- `src/services/project-settings.ts`: schema version, defaults, normalization, validation.
- `src/platform/OPFSWorkspace.ts`: OPFS layout and path resolution.
- `src/platform/LocalDirectoryWorkspace.ts`: directory layout, permissions, recovery.
- `src/utils/path-utils.ts`: path normalization.
- `src/platform/section-order.ts`: move/order behavior.

Suggested file:

- `docs/reference/project-format.md`

### 8. Export Guide

Audience: authors, testers, developers.

Purpose: explain export behavior, limits, and how to validate output.

Should cover:

- PDF export flow:
  - Flush current document.
  - Compile durable snapshot.
  - Force paginated preview render.
  - Send paginated HTML, page setup, typography, list, table, and metadata settings to browser export service.
  - Hidden iframe print target with popup fallback.
  - Cache, telemetry, and cleanup behavior.
- DOCX export flow:
  - Compile durable snapshot.
  - Apply heading numbering and TOC transforms.
  - Convert HTML blocks to DOCX elements.
  - Resolve images.
  - Generate headers and footers.
- What carries over into DOCX: headings, paragraphs, lists, images, tables, TOC, custom blocks, page setup, metadata.
- Known differences between paginated preview, PDF, and DOCX.

Source map:

- `src/boot/app.ts`: export button event handlers.
- `src/services/ExportSnapshotService.ts`: durable export snapshot generation.
- `src/platform/BrowserExportService.ts`: browser save/export implementation.
- `src/platform/pdf-print-css.ts`: print CSS support.
- `src/services/ExportDocxService.ts`: DOCX conversion.
- `test/export-docx.test.cjs`, `test/export-snapshot.test.cjs`, `test/browser-export-service.test.cjs`, `test/pdf-print-css.test.cjs`: export tests.

Suggested file:

- `docs/user/exporting.md`

### 9. Developer Architecture

Audience: maintainers and contributors.

Purpose: describe the internal architecture and where changes belong.

Should cover:

- Boot sequence:
  - `src/main.ts` selects app boot or worker boot based on `?worker=true`.
  - `src/boot/app.ts` renders the app layout and wires services.
  - `src/boot/worker.ts` handles worker-mode pagination plumbing.
- State model:
  - `state` as an evented immutable snapshot store.
  - App state events and UI listeners.
  - Local editor preferences in localStorage.
- Workspace abstraction:
  - `Platform`, `WorkspaceRepository`, `WorkspaceSession`, `AssetResolver`, `DocumentExportService`.
  - OPFS and local directory implementations.
- Editor architecture:
  - CodeMirror setup through compartments.
  - Autosave with `DocumentSaveCoordinator`.
  - Draft recovery and save-status reporting.
- Preview architecture:
  - Compile pipeline, Paged.js render, exact render scheduling.
- Settings architecture:
  - Defaults, validation, migration, serialized mutation.
- Error handling:
  - Notices, confirm dialog, runtime feedback, beforeunload protection.

Source map:

- `src/main.ts`
- `src/boot/app.ts`
- `src/boot/worker.ts`
- `src/state.ts`
- `src/platform/types.ts`
- `src/platform/runtime.ts`
- `src/ui/editor-manager.ts`
- `src/editor/createEditor.ts`
- `src/editor/DocumentSaveCoordinator.ts`
- `src/preview/*`
- `src/services/*`
- `src/ui/components/Notice.ts`
- `src/services/project-runtime-feedback.ts`

Suggested file:

- `docs/developer/architecture.md`

### 9a. Technology Stack And Development Model

Audience: maintainers, contributors, and technical reviewers.

Purpose: provide the concrete development stack and runtime boundaries before reading the deeper architecture notes.

Should cover:

- TypeScript, Node.js, Vite, and native ES module tooling.
- CodeMirror 6 and the DOM/CSS UI model.
- Unified, Remark, Rehype, and Clear Writer compiler plugins.
- Paged.js preview pagination and browser print PDF export.
- Browser/PWA runtime, OPFS, IndexedDB, File System Access API, and service worker behavior.
- Workspace adapter contracts and shared project-path utilities.
- DOCX implementation status and the current browser-runtime disablement.
- Unit, browser smoke, performance, PWA, and release-preparation checks.

Source map:

- `package.json`
- `src/main.ts`
- `src/boot/app.ts`
- `src/platform/*`
- `src/compiler/*`
- `src/preview/*`
- `public/manifest.webmanifest`
- `public/sw.js`
- `patch-pagedjs.js`
- `test/*`

Suggested file:

- `docs/developer/technology-stack.md`

### 10. Build, Test, And Release

Audience: maintainers and release operators.

Purpose: explain how to verify the app and prepare web/PWA releases.

Should cover:

- Install dependencies with `npm install`.
- Development server with `npm run dev` or `npm run dev:web`.
- Production build with `npm run build` or `npm run build:web`.
- Static preview with `npm run preview`.
- Type checking with `npm run typecheck`.
- Unit/integration tests with `npm test`.
- Performance tests with `npm run test:perf`.
- Browser smoke tests with `npm run test:browser-smoke`.
- PWA smoke tests with `npm run test:pwa-smoke`.
- Release prep with `npm run release:prep`.
- Profiling with `npm run profile:preview` and `npm run profile:pagination`.

Source map:

- `package.json` scripts.
- `vite.web.config.ts` and `vite.shared.ts`.
- `tsconfig.json`.
- `scripts/*`.
- `test/*.test.cjs`.
- `test/*.perf.cjs`.
- `test/fixtures/*`.
- `dist-web/` as generated web output.

Suggested file:

- `docs/developer/build-test-release.md`

## Source Directory Map

### `src/boot`

Owns application and worker startup. The app boot renders the app layout, creates the editor manager, initializes the in-app settings panels and sidebar, binds export controls, registers lifecycle protections, and opens/restores projects.

Documentation ownership:

- Boot sequence in developer architecture.
- Startup troubleshooting.

### `src/compiler`

Owns Markdown-to-HTML compilation. It uses `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-raw`, `rehype-sanitize`, and custom plugins for list markers, image attributes, table styles, metadata substitution, TOC placeholders, custom inline styles, and custom block styles. Quote-style glyphs are resolved through the custom block glyph helpers rather than the generic image pipeline.

Documentation ownership:

- Markdown support reference.
- Security/sanitization notes.
- Custom syntax reference.

### `src/config`

Owns defaults and font family options.

Documentation ownership:

- Settings reference defaults.
- Template/design defaults.

### `src/editor`

Owns CodeMirror setup, editor theme, commands, bindings, custom style highlighting, drag/drop, save queue, draft recovery, headings, templates, and writing statistics.

Documentation ownership:

- Markdown editing guide.
- Editor settings reference.
- Keyboard/interaction reference.

### `src/images`

Owns Markdown image parsing, project image source resolution, blob URL resolution, and fallbacks.

Documentation ownership:

- Image handling guide.
- Project format image path notes.
- Export image limits.

### `src/perf`

Owns preview metrics displayed in the diagnostics chip and used for profiling.

Documentation ownership:

- Developer performance notes.
- Profiling guide.

### `src/platform`

Owns runtime abstraction and browser workspace implementations. It includes OPFS projects, local directory projects, directory handle catalogue, blob URL assets, browser export service, PDF print CSS, filesystem helpers, and section ordering.

Documentation ownership:

- Project storage guide.
- Architecture guide.
- Browser capability matrix.
- Project recovery behavior.

### `src/preview`

Owns preview rendering, Paged.js integration, responsive viewport behavior, CSS generation, heading numbering, table of contents, special headings, and multi-section document rendering.

Documentation ownership:

- Live preview guide.
- Layout and pagination reference.
- Export rendering notes.

### `src/services`

Owns project operations, settings persistence, settings schema normalization, export snapshots, DOCX export, project search/review, and runtime feedback.

Documentation ownership:

- Project guide.
- Settings reference.
- Export guide.
- Developer services map.

### `src/ui`

Owns DOM setup for settings panels, sidebar, project flow modal, keyboard shortcuts, project metadata, page/list/table/TOC setup, special headings, search, review, outline, and reusable UI components.

Documentation ownership:

- User guide screenshots or UI tours.
- Settings guide.
- Project explorer guide.

### `test`

Owns regression coverage across settings, rendering, exports, platform behavior, performance, browser smoke tests, and release contracts.

Documentation ownership:

- Testing guide.
- Release checklist.

### `scripts`

Owns profiling and smoke-test command entry points.

Documentation ownership:

- Build/test/release guide.
- Performance profiling guide.

### `public`

Owns PWA/public web assets, including manifest, service worker, icons, and favicon.

Documentation ownership:

- PWA/deployment notes.

### `dist-web`

Generated web build output. Do not treat it as source documentation authority except when documenting release artifacts.

Documentation ownership:

- Release artifact notes only.

## Feature Inventory

### Project And Workspace Features

- New project.
- Open project.
- Save project.
- Close project.
- Browser storage projects through OPFS.
- Local directory projects through File System Access API when available.
- Recent workspace tracking.
- Last workspace restoration through `?restoreLastWorkspace=true`.
- Sections tree with Markdown files and folders.
- Images tree with preview and insert support.
- Project health inspection and settings recovery for local directory projects.

Primary source:

- `src/platform/runtime.ts`
- `src/platform/OPFSWorkspace.ts`
- `src/platform/LocalDirectoryWorkspace.ts`
- `src/platform/DirectoryHandleCatalogue.ts`
- `src/platform/OPFSCatalogue.ts`
- `src/services/ProjectService.ts`
- `src/ui/components/ProjectExplorer.ts`

### Editor Features

- CodeMirror Markdown editor.
- Markdown toolbar commands.
- Search panel.
- Project search panel.
- Document outline panel.
- Project review panel.
- Symbol picker.
- Autosave and save status.
- Draft recovery.
- Per-section word count and reading-time estimate.
- Editor appearance and assist settings.

Primary source:

- `src/editor/createEditor.ts`
- `src/ui/editor-manager.ts`
- `src/editor/markdown-commands.ts`
- `src/editor/DocumentSaveCoordinator.ts`
- `src/editor/DraftRecoveryStore.ts`
- `src/ui/components/EditorPanel.ts`

### Preview Features

- Live paginated preview.
- Full-document merged preview.
- Single-section preview while editing.
- Debounced Paged.js pagination after edits.
- Responsive zoom.
- Header/footer margin boxes.
- Heading numbering.
- Table of contents.
- Special headings.
- Image resolution through active workspace.
- Revision-aware preview navigation built from committed preview indexes.

Primary source:

- `src/preview/PreviewController.ts`
- `src/preview/RenderEngine.ts`
- `src/preview/PreviewViewport.ts`
- `src/preview/CssGenerator.ts`
- `src/preview/document-rendering/*`
- `src/preview/headingNumbering.ts`
- `src/preview/tableOfContents.ts`
- `src/preview/specialHeadings.ts`

### Settings Features

- Page setup.
- Typography setup.
- List setup.
- Table setup.
- TOC setup.
- Special heading setup.
- Project metadata.
- Custom inline styles.
- Custom quote/block styles.
- Editor setup.
- Settings migration and validation.

Primary source:

- `src/types/index.ts`
- `src/config/defaults.ts`
- `src/services/SettingsService.ts`
- `src/services/project-settings.ts`
- `src/ui/components/SettingsDrawer.ts`
- `src/ui/components/*Drawer.ts`

### Export Features

- PDF export where supported by the browser export service.
- DOCX export implementation through the `docx` package, currently unavailable in the active browser runtime.
- Durable snapshot generation before export.
- Image preloading and resolution.
- Header/footer rendering.
- TOC, special heading, and heading numbering transforms before DOCX conversion.
- Export cache, stale-render retry, and performance metrics for PDF.

Primary source:

- `src/boot/app.ts`
- `src/services/ExportSnapshotService.ts`
- `src/services/ExportDocxService.ts`
- `src/platform/BrowserExportService.ts`
- `src/platform/pdf-print-css.ts`

## Settings Data Map

Canonical interfaces live in `src/types/index.ts`. Defaults live in `src/config/defaults.ts`.

### `PageSetup`

Fields:

- `paperWidth`, `paperHeight`: page size in millimeters.
- `marginTop`, `marginBottom`, `marginLeft`, `marginRight`: margins in millimeters.
- `header`, `footer`: three-cell rows.
- `toc`: table of contents settings.
- `specialHeadings`: special heading definitions.
- `showGuidelines`: preview guide lines.

Related UI:

- Page setup panel.
- TOC panel.
- Special headings panel.
- Preview renderer.
- PDF and DOCX export.

### `TypographySetup`

Fields:

- `paragraph`
- `h1` through `h6`

Each style includes font family, font size, color, bold, italic, line height, top margin, and bottom margin.

Related UI:

- Typography panel.
- Editor Markdown appearance for heading/link/strong/emphasis styling.
- Preview CSS.
- DOCX conversion.

### `ListSetup`

Fields:

- `ulAsterisk`
- `ulDash`
- `ulPlus`
- `ol`
- `olParen`

Each style includes font, marker/counter icon, marker color, and marker/text spacing.

Related UI:

- Lists panel.
- Remark list marker plugin.
- Preview CSS.
- DOCX conversion.

### `TableSetup`

Fields:

- `table1`
- `table2`

Each table style includes font settings, header/body/alternate-row colors, borders, padding, and vertical margins.

Related UI:

- Tables panel.
- Remark table style plugin.
- Preview CSS.
- DOCX conversion.

### `ProjectMetadata`

Fields:

- `author`
- `documentTitle`
- `documentName`
- `documentNumber`
- `documentRevision`
- `documentType`
- `productName`
- `productModule`
- `productVersion`

Related UI:

- Project metadata panel.
- Metadata substitution plugin.
- Header/footer text substitution.
- DOCX document properties.

### `CustomStyle`

Fields:

- `id`
- `name`
- `openingPair`
- `closingPair`
- font family, font size, color, bold, italic

Related UI:

- Custom inline styles tab.
- CodeMirror custom style extension.
- Markdown compiler custom styles plugin.

### `CustomBlockStyle`

Fields:

- `id`
- `name`
- `prefix`
- `icon`
- font family, font size, color, bold, italic
- optional line height, top margin, bottom margin

Related UI:

- Custom quote styles tab.
- Block glyph picker.
- CodeMirror custom block style extension.
- Markdown compiler custom block styles plugin.
- DOCX custom block conversion.

### `EditorSetup`

Fields:

- `lineWrapping`
- `linkUnderline`
- `fontSize`
- `headingBold`
- `headingColors`
- `strongBold`
- `emphasisItalic`
- `lineNumbers`
- `foldGutter`
- `foldGutterGlyph`
- `highlightActiveLine`
- `highlightSpecialCharacters`
- `bracketMatching`
- `closeBrackets`
- `autocompletion`
- `indentOnInput`
- `multipleSelections`
- `rectangularSelection`
- `highlightSelectionMatches`

Related UI:

- Editor settings tab.
- CodeMirror compartments.
- Local storage key: `clear-writer-editor-setup`.

## Project Format Map

A project is expected to contain:

```text
project-root/
  settings.json
  sections/
    *.md
    folders/
      *.md
  images/
    image assets
```

Notes:

- Section paths are normalized to `sections/...`.
- Image paths are normalized to `images/...`.
- Only Markdown files ending in `.md` or `.markdown` are listed as section files.
- `settings.json` is normalized to schema version 4.
- Path lists in settings are normalized and deduplicated.
- Settings reads are side-effect free; settings mutations perform writes.
- Local directory projects can recover missing or malformed settings by writing defaults and optionally backing up the original file.

Primary source:

- `src/services/project-settings.ts`
- `src/platform/OPFSWorkspace.ts`
- `src/platform/LocalDirectoryWorkspace.ts`
- `src/services/ProjectService.ts`

## Build And Test Command Map

Commands from `package.json`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server with `vite.web.config.ts`. |
| `npm run dev:web` | Alias for the web dev server. |
| `npm run build` | Run TypeScript and build `dist-web`. |
| `npm run build:web` | Alias for the web build. |
| `npm run typecheck` | TypeScript check without emitting files. |
| `npm test` | Run Node test suite in `test/*.test.cjs`. |
| `npm run test:perf` | Run performance tests in `test/*.perf.cjs`. |
| `npm run test:browser-smoke` | Run release browser smoke script. |
| `npm run test:pwa-smoke` | Build and run web/PWA smoke script. |
| `npm run release:prep` | Run tests, perf, browser smoke, and PWA smoke. |
| `npm run profile:preview` | Profile preview performance. |
| `npm run profile:pagination` | Profile pagination performance. |
| `npm run preview` | Preview built `dist-web` output. |

## Open Questions For Future Docs

- Decide whether docs should be split by audience under `docs/user`, `docs/reference`, and `docs/developer`.
- Decide whether screenshots are required for the first user-guide pass.
- Document exact browser support once tested against target browsers.
- Capture known PDF/DOCX fidelity differences after visual QA.
- Decide whether `dist-web` should be documented as release output only or excluded from docs references entirely.

## Suggested Writing Order

1. Settings reference, because the data model is explicit and stable in the code.
2. Getting started, because it gives users a working path through the app.
3. Project format reference, because it supports troubleshooting and local folder use.
4. Markdown editing guide, because it explains the core authoring surface.
5. Live preview guide, because it explains the app's most distinctive behavior.
6. Export guide, because it depends on understanding preview, settings, and project format.
7. Developer architecture, because it should reflect the user-facing docs once terminology settles.
8. Build/test/release guide, because command names are already stable in `package.json`.
