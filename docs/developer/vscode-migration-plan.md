# VS Code Extension Migration Plan

## Purpose

This plan defines a phased migration of Clear Writer from its current browser/PWA host to a Visual Studio Code extension. It preserves Clear Writer's differentiating document workflow while replacing capabilities that VS Code already provides well: source editing, workspace management, file navigation, search, autosave, and command discovery.

This is a product adaptation rather than a UI port. VS Code becomes the authoring workspace and filesystem host; Clear Writer remains responsible for document settings, semantic compilation, paginated preview, document-aware review, and exports.

## Target Product Shape

A Clear Writer project opens as a normal VS Code folder:

```text
my-document/
  settings.json
  sections/
    introduction.md
    requirements.md
  images/
    diagram.png
```

The user works in VS Code's normal Markdown editor and Explorer. The extension adds:

- `Clear Writer: Configure Project`, which opens a friendly project-settings form in an editor tab.
- `Clear Writer: Open Live Preview`, which opens an adjacent paginated preview.
- `Clear Writer: Export DOCX` and `Clear Writer: Export PDF` commands.
- A compact Clear Writer sidebar for document-aware navigation, project health, review, and export actions.
- Commands, status information, diagnostics, and context-menu actions integrated into the normal VS Code workflow.

The settings experience is intentionally an editor-tab form rather than an animated drawer. It should be polished, fast, accessible, and easy to revisit, without reproducing the browser UI's drawer animation model.

## Target Architecture

```text
VS Code Workbench
  Native Explorer and Markdown Editors
  Clear Writer Extension Host (Node.js)
    Project service
    Settings validation and persistence
    Workspace filesystem adapter
    Compiler and document model
    DOCX export service
    Commands and diagnostics
  Clear Writer Webviews
    Project settings editor
    Paginated preview
```

The first target is a desktop VS Code extension running in the Node.js extension host. This supports workspace filesystem access and allows the existing DOCX implementation to run outside the browser restrictions that currently disable it.

Browser-hosted VS Code support can be evaluated later. It has a browser sandbox and does not provide Node.js APIs, so it should not shape the first release architecture.

## Capability Mapping

| Current Clear Writer capability | VS Code equivalent | Migration decision |
| --- | --- | --- |
| CodeMirror editor | Native VS Code Markdown editor | Replace |
| CodeMirror toolbar | Commands, keybindings, editor/title actions | Replace |
| Custom Markdown highlighting | TextMate grammar/injections and decorations where useful | Replace selectively |
| Project explorer | Native Explorer plus Clear Writer tree view | Homologate |
| Browser OPFS projects | Normal workspace folders | Replace |
| Browser directory picker | `Open Folder` / workspace selection | Replace |
| Autosave queue and draft recovery | VS Code dirty documents, autosave, and hot exit | Replace; retain only project-write safeguards |
| Settings drawers | Editor-tab settings webview | Replace |
| Settings JSON and validation | Keep schema; validate on read/write; provide form UI | Retain and improve |
| Live Paged.js preview | Webview editor tab | Retain and adapt |
| Browser PDF print | Deliberate extension PDF workflow | Replace |
| DOCX code disabled in browser | Node extension host plus existing `docx` service | Enable and harden |
| Project-wide search | Native VS Code search plus document-aware commands | Homologate |
| Outline/review panels | Tree views, diagnostics, and Problems panel | Replace/homologate |
| PWA/service worker/manifest | VSIX packaging and extension activation | Remove |

## Shared Core And Extension Boundaries

Create a runtime-neutral `packages/core` package. It becomes the shared document engine for both the existing PWA and the VS Code extension during the transition.

Move or retain in the core package:

- `src/types/index.ts`
- `src/config/defaults.ts`
- `src/services/project-settings.ts`
- Markdown compiler and Remark/Rehype plugins
- Section ordering and project-path utilities
- Metadata substitution, TOC, numbering, table/list/custom-style transforms
- `ExportSnapshotService`
- DOCX conversion logic, after it is made Node-safe

Keep host-specific implementations outside the core package:

- OPFS, IndexedDB, browser persistence APIs, and the File System Access API
- Blob URL asset resolution
- Service worker and PWA assets
- Browser print iframe/popup export
- DOM application UI and CodeMirror integration

The extension should implement the existing workspace and asset contracts where possible, rather than rewriting project behavior. Its workspace adapter uses `vscode.workspace.fs`; its webview asset adapter converts resources with `webview.asWebviewUri`.

Create `packages/vscode-extension` for the VS Code host code:

- `extension.ts`: activation and command registration.
- `WorkspaceProjectRepository`: Clear Writer project access through VS Code workspace APIs.
- `SettingsEditorProvider`: project configuration editor tab.
- `PreviewPanel`: paginated preview and revision-aware preview navigation.
- `ClearWriterTreeProvider`: document-aware navigation and review.
- `ExportService`: DOCX and PDF orchestration.
- `DiagnosticsProvider`: settings, images, directives, and project-health diagnostics.
- `commands/`: independently testable command handlers.

## Phase 0: Baseline And Architecture Record

### Goal

Establish the target boundaries and compatibility expectations before code movement.

### Work

- Record the initial product decisions:
  - Desktop VS Code is the first supported host.
  - Workspace folders replace browser project storage.
  - `settings.json` remains canonical project configuration.
  - VS Code's native Markdown editor replaces CodeMirror.
  - Editor-tab webviews provide project settings and paginated preview.
- Create a feature matrix marking every current capability as retain, replace with native VS Code, defer, or remove.
- Build representative project fixtures covering multiple sections, images, custom styles, tables, TOC, headers/footers, malformed settings recovery, and DOCX fidelity.
- Capture baseline preview HTML and DOCX outputs for comparison in later phases.
- Agree PDF scope before preview implementation begins.

### Acceptance Criteria

- Every current feature has an owner and target mechanism.
- The PWA remains buildable and testable while the extension is developed.
- Representative fixtures can detect behavioral or output regressions.

## Phase 1: Extract The Runtime-Neutral Document Core

### Goal

Separate Clear Writer's document engine from browser UI and storage implementations.

### Work

- Create `packages/core`.
- Move settings schema, migrations, defaults, compiler, document composition, and section ordering into the core.
- Define narrow interfaces for reading project files, resolving assets, writing settings, and reporting progress.
- Remove hidden DOM and browser assumptions from shared modules.
- Add Node-oriented asset resolution for extension exports.
- Preserve existing behavior through unit and contract tests.

### Acceptance Criteria

- Shared tests run without a browser DOM.
- The PWA consumes the extracted core without behavior regressions.
- A Node test can load a real project folder, compile its document, and resolve its images.

## Phase 2: Extension Skeleton And Native Project Workflow

### Goal

Make Clear Writer projects operate inside VS Code before building custom UI.

### Work

- Scaffold a TypeScript VS Code extension and its extension-host tests.
- Activate for workspaces that contain `settings.json`, Markdown files under `sections/`, or an explicit Clear Writer command.
- Implement `WorkspaceProjectRepository` with `vscode.workspace.fs`.
- Register commands:
  - Configure Project
  - Open Live Preview
  - Export DOCX
  - Validate Project
  - Create Section
  - Create Folder
  - Insert Project Image
- Add Explorer context menus for `sections/**/*.md` and `images/**`.
- Surface malformed, missing, or outdated `settings.json` as project-health diagnostics.

### Replacement Decisions

- Remove OPFS, IndexedDB catalogues, browser persistence prompts, and directory-handle recovery from the extension path.
- Use VS Code workspace folders, file watching, dirty-file state, and normal Explorer operations.
- Use native file rename, move, and delete operations rather than recreating a custom project explorer.

### Acceptance Criteria

- Opening a Clear Writer folder activates the extension.
- Existing projects validate without modification.
- New projects initialize in an empty workspace.
- Sections and images remain correct after renames and moves.

## Phase 3: Project Settings Editor

### Goal

Provide the friendly settings UI required for project setup and later adjustment.

### UI Structure

```text
Clear Writer Project Settings

Overview       Project name, document metadata, validation summary
Page Layout    Paper, margins, headers, footers, guides
Typography     Paragraph and heading styles
Contents       TOC, numbering, special headings
Components     Lists, tables, custom inline and block styles
Editor         Clear Writer-specific authoring preferences
```

### Work

- Implement an editor-tab `WebviewPanel` named `Clear Writer Project Settings`.
- Build a focused form application rather than reusing the current browser drawer DOM.
- Use VS Code theme variables and support light, dark, and high-contrast themes.
- Define an intent-based message protocol:
  - The extension sends normalized settings and validation data.
  - The webview sends requested field changes rather than raw file writes.
  - The extension validates, migrates if necessary, and persists `settings.json`.
  - The extension returns saved state and field-level validation information.
- Include Save, Revert, inline validation, an unsaved-changes warning, reset-to-default controls, and external-file-change detection.
- Keep `settings.json` directly editable for advanced users, while positioning the form as the primary editing experience.

### Design Rule

The webview is never the source of truth. The extension host owns settings normalization, migration, validation, persistence, and conflict detection. This avoids creating a second, inconsistent settings system.

### Acceptance Criteria

- Users can configure every currently supported setting without editing JSON.
- Invalid values do not persist.
- Direct edits to `settings.json` are reflected in the form.
- Settings changes refresh preview output.
- The form works at narrow editor widths and with keyboard-only navigation.

## Phase 4: Live Paginated Preview

### Goal

Preserve the core authoring loop: Markdown source beside a faithful paginated document preview.

### Work

- Open a preview `WebviewPanel` beside the active Markdown editor.
- Reuse the compiler, CSS generator, Paged.js integration, numbering, TOC, image handling, and special-heading transforms.
- Convert workspace image paths to webview-safe URIs through `webview.asWebviewUri`.
- Send incremental messages for active-document edits.
- Run exact pagination after a short idle debounce.
- Add preview controls for full-document or active-section mode, zoom, refresh, settings, and export.
- Add revision-aware preview navigation only if the committed preview state can be resolved reliably.
- Carry over the current fast-preview implementation only if profiling demonstrates a meaningful benefit.

### Acceptance Criteria

- Multi-section projects render as a coherent paginated document.
- Images work in local and remote workspace scenarios.
- Preview updates after source-file changes.
- Page layout, typography, TOC, numbering, headers/footers, tables, and custom styles meet fixture expectations.

## Phase 5: Export Strategy

### Goal

Replace browser-bound export behavior with reliable extension-native workflows.

### Phase 5A: DOCX Export

DOCX should be the first production export target. The existing implementation can run in the Node-based extension host, removing the browser-runtime restriction that currently disables it.

Work:

- Adapt `ExportDocxService` for workspace paths and extension-host asset resolution.
- Add DOCX export from commands, preview toolbar, and settings UI.
- Use `vscode.window.showSaveDialog` or a project-local `exports/` folder according to user choice.
- Add progress reporting and file-specific error messages.
- Validate export with representative visual fixtures.

Acceptance criteria:

- DOCX export supports sections, images, tables, TOC, headings, custom blocks, metadata, headers, footers, and page settings.
- Export does not depend on browser APIs.
- Errors identify the affected source file or asset.

### Phase 5B: PDF Export Decision And Delivery

The browser hidden-iframe print flow should not be directly ported. VS Code does not expose an equivalent extension API.

Recommended staged approach:

1. Provide `Export HTML for Print` and `Open Print Preview`.
2. Generate PDF with a controlled Node-side renderer, such as a bundled Chromium/Playwright pipeline or a dedicated HTML-to-PDF toolchain.
3. Declare production PDF support only after visual comparison against approved fixtures.

A bundled browser renderer is likely to preserve HTML/CSS/Paged.js fidelity but increases VSIX size and update complexity. A pure Node PDF library is lighter but would require Clear Writer to reproduce pagination and style fidelity itself.

Recommendation: release DOCX first, offer print-ready HTML as the interim PDF path, then choose the PDF renderer based on output fidelity, package size, installation reliability, and security review.

## Phase 6: Native Navigation, Review, And Authoring Assistance

### Goal

Use native VS Code surfaces wherever they improve the experience, keeping custom UI for Clear Writer-specific value.

### Work

- Retain the native Explorer as the primary file navigator.
- Add a compact Clear Writer sidebar with document order, section flags, visibility/page-break markers, outline, review findings, and quick settings/export actions.
- Publish project-review results as diagnostics in VS Code's Problems panel.
- Add code actions for recoverable issues: create missing settings, migrate settings, correct image paths, and insert missing metadata.
- Add Markdown editor title actions for previewing the active section, inserting project images, inserting a TOC placeholder, and applying custom block styles.
- Evaluate a lightweight Markdown language extension only for custom directives that need syntax visibility.

### Replacement Decisions

- Use VS Code's native Search instead of reproducing the custom project-search panel.
- Use VS Code Outline where possible, supplemented by Clear Writer-specific section semantics.
- Retire the symbol picker unless a domain-specific symbol library demonstrates sustained value.

### Acceptance Criteria

- Core authoring tasks are available without opening a custom webview.
- Clear Writer-specific issues integrate with the Problems workflow.
- Section, review, preview, and export operations are keyboard accessible.

## Phase 7: Hardening, Distribution, And Transition

### Goal

Ship safely without forcing PWA users into an incomplete workflow.

### Work

- Add extension integration tests and shared core contract tests.
- Add visual regression tests for preview and export output.
- Test Windows, macOS, Linux, local workspaces, remote SSH/WSL/container workspaces, workspace trust states, themes, large projects, and large image sets.
- Define restricted-workspace behavior: allow read-only preview and validation; gate writes and exports where appropriate.
- Package a versioned VSIX for private testing.
- Publish a migration guide for opening existing Clear Writer project folders in VS Code, validating them, configuring settings, comparing preview, and exporting.
- Keep the PWA available throughout a pilot period and use pilot results to identify fidelity gaps.

### Acceptance Criteria

- Existing PWA projects open without manual file conversion.
- Preview and DOCX fixtures meet agreed fidelity thresholds.
- Errors are actionable and do not corrupt `settings.json`.
- A documented rollback path returns users to the PWA.

## Delivery Sequence

1. Core extraction and project validation.
2. Workspace support and native VS Code commands.
3. Project settings editor.
4. Paginated preview.
5. DOCX export.
6. Navigation, review, and authoring integration.
7. PDF renderer decision and implementation.
8. Pilot, compatibility validation, and public release.

The first meaningful user-testable milestone is Phase 3: a user can open an existing project in VS Code and edit all Clear Writer settings through a friendly editor-tab interface. The first end-to-end authoring milestone is Phase 5: edit Markdown natively, inspect a paginated preview, and export DOCX.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Preview fidelity | Create visual fixtures early; test fonts, image URIs, pagination, and print CSS in webviews. |
| PDF quality and scope | Make an explicit renderer decision; do not promise parity before fixture-based comparison. |
| Settings compatibility | Keep `settings.json` canonical and protect migrations with contract tests. |
| Remote workspaces | Keep filesystem operations in the extension host and serve preview resources through webview URIs. |
| Unnecessary scope | Do not recreate Explorer, editor, search, or autosave without a demonstrated Clear Writer-specific need. |
| Webview security | Restrict resource roots, use strict content security policy, validate messages, and never trust webview-side settings data. |

## Success Definition

The migration is successful when an existing Clear Writer project can be opened as a VS Code workspace; users can author Markdown using VS Code's native editor; project settings can be configured through a friendly form; the document can be reviewed in a paginated preview; and supported exports are produced reliably without browser/PWA storage or UI dependencies.

## Phase Implementation Playbooks

This section is the implementation guide for the developer assigned to each phase. Complete a phase's reading and acceptance criteria before beginning the next phase. Do not move source files as a first step: first prove the intended boundary with tests, then move small coherent units.

### Shared Rules For Every Phase

Before changing code:

1. Read the complete source files listed for the phase, not only the named functions. Most of the important behavior is encoded in types, initialization order, and error handling around the main methods.
2. Run the current relevant test command and record the result in the pull request description.
3. Preserve `settings.json` compatibility. A VS Code migration must not require users to manually convert current projects.
4. Prefer a small adapter over copying business logic. The core owns document rules; the extension owns VS Code APIs; webviews own presentation only.
5. Add tests at the same layer as the change: core tests for document logic, extension-host tests for VS Code integration, and webview tests for UI behavior.

Do not edit generated output such as `dist-web/`. Do not move the existing PWA implementation until the shared replacement is covered by tests and consumed successfully by both hosts.

### Phase 0 Playbook: Baseline And Architecture Record

#### What To Read

Read these files in order:

1. `docs/DOCUMENTATION_MAP.md` for the full feature inventory and source mapping.
2. `docs/developer/technology-stack.md` for current browser boundaries.
3. `src/types/index.ts` for the canonical project and settings data model.
4. `src/config/defaults.ts` for the default document behavior.
5. `src/services/project-settings.ts` for schema versioning, normalization, validation, and migrations.
6. `src/services/ProjectService.ts` for project operations and assumptions.
7. `src/boot/app.ts` to identify the current application composition root.
8. `package.json` and `test/` to understand existing validation commands and fixture patterns.

#### Deliverables

Create these documents before feature implementation:

- `docs/developer/vscode-decision-record.md`
- `docs/developer/vscode-feature-matrix.md`
- `test/fixtures/vscode-migration/README.md`

The decision record must state the initial supported runtime, storage model, preview ownership, export strategy, workspace trust policy, and compatibility promise. The feature matrix must contain each current feature, its current source, its VS Code replacement, its target phase, and whether it is retained, replaced, deferred, or removed.

#### Fixture Layout

Create representative projects rather than isolated JSON samples:

```text
test/fixtures/vscode-migration/
  basic-project/
  complex-project/
  invalid-settings-project/
  missing-image-project/
  expected/
    complex-project-preview.html
    complex-project.docx
```

The `complex-project` fixture should exercise sections, nested folders, images, headers, footers, TOC, tables, list styles, metadata, special headings, custom inline styles, and custom block styles.

#### Completion Checklist

- The team has agreed how PDF will be handled in the first extension release.
- A developer can identify the current source and destination for every user-visible feature.
- The fixture set includes a known-good project and at least one recoverable broken project.
- No production implementation is changed in this phase.

### Phase 1 Playbook: Extract The Runtime-Neutral Core

#### What To Read

Read these files before extracting anything:

1. `src/types/index.ts`
2. `src/config/defaults.ts`
3. `src/services/project-settings.ts`
4. `src/compiler/index.ts`
5. Every file under `src/compiler/remark-plugins/` and `src/compiler/rehype-plugins/`
6. `src/preview/document-rendering/index.ts` and its sibling rendering files
7. `src/preview/CssGenerator.ts`
8. `src/preview/headingNumbering.ts`, `src/preview/tableOfContents.ts`, and `src/preview/specialHeadings.ts`
9. `src/services/ExportSnapshotService.ts` and `src/services/ExportDocxService.ts`
10. `src/platform/types.ts`, `src/platform/project-paths.ts`, and `src/platform/section-order.ts`

While reading, mark every import that refers to `window`, `document`, `Blob`, `URL.createObjectURL`, browser filesystem APIs, CodeMirror, or a UI component. Those imports cannot remain in the runtime-neutral core.

#### Destination Layout

Create a package layout that makes runtime ownership obvious:

```text
packages/
  core/
    src/
      config/
      compiler/
      document/
      export/
      project/
      settings/
      types/
      index.ts
    test/
  vscode-extension/
    src/
      extension.ts
      adapters/
      commands/
      diagnostics/
      panels/
      providers/
      services/
      webview/
    test/
```

Use names based on responsibility, not legacy source folders. For example:

- Move `src/services/project-settings.ts` to the `settings/projectSettings.ts` module in the `packages/core` package.
- Move compiler modules to `packages/core/src/compiler/` without changing their public behavior.
- Move project path and ordering logic to `packages/core/src/project/`.
- Keep `src/platform/OPFSWorkspace.ts`, `src/platform/LocalDirectoryWorkspace.ts`, and `src/platform/BrowserExportService.ts` in the PWA host because they are browser-specific.

#### Step-By-Step Work

1. Add workspace package configuration without changing imports in the PWA.
2. Copy one small, pure module into `packages/core`, export it, and add equivalent tests there.
3. Change the PWA import to use the core package.
4. Run type checking and all affected tests.
5. Repeat for types, defaults, settings, project paths, compiler transforms, and document composition.
6. Introduce interfaces only at true host boundaries. Do not make every function abstract.
7. Stop and resolve any browser dependency that reaches the core before continuing.

#### Tests To Add

- Settings migration and validation tests using the existing versioned fixtures.
- Compiler snapshot tests against the representative projects.
- Project path normalization and section ordering tests.
- A Node-only test proving that core compilation does not require `window` or `document`.

#### Completion Checklist

- Both PWA and Node tests import the same core settings and compiler APIs.
- The core package has no import from `src/ui`, CodeMirror, OPFS, IndexedDB, service-worker code, or browser export code.
- Existing PWA tests remain green.

### Phase 2 Playbook: Extension Skeleton And Workspace Adapter

#### What To Read

Read these current files:

1. `src/platform/types.ts` for the workspace contract.
2. `src/platform/LocalDirectoryWorkspace.ts` for folder layout, error handling, and settings recovery behavior.
3. `src/platform/OPFSWorkspace.ts` only to distinguish browser-specific behavior from project semantics.
4. `src/platform/project-paths.ts`, `src/platform/fs-helpers.ts`, and `src/platform/section-order.ts`.
5. `src/services/ProjectService.ts` for required project operations.
6. `src/services/project-runtime-feedback.ts` for user-facing failure patterns.
7. `src/ui/components/ProjectExplorer.ts` and `src/ui/sidebar/SidebarController.ts` to enumerate user actions; do not port their DOM implementation.

Also read the official VS Code API documentation for commands, workspace filesystem access, tree views, diagnostics, extension activation, and workspace trust before introducing each related API.

#### Destination Layout

Create these extension modules:

```text
packages/vscode-extension/src/
  extension.ts
  adapters/
    vscodeWorkspaceProjectRepository.ts
    vscodeAssetResolver.ts
  commands/
    configureProject.ts
    createProject.ts
    createSection.ts
    insertProjectImage.ts
    validateProject.ts
  diagnostics/
    projectDiagnostics.ts
  services/
    projectLocator.ts
    projectValidationService.ts
```

`extension.ts` must only register activation, commands, providers, and disposables. Do not place business logic in it.

#### Step-By-Step Work

1. Create the extension manifest with the minimum commands and activation events.
2. Implement `projectLocator.ts` to locate the workspace folder containing `settings.json`.
3. Implement the workspace adapter using `vscode.workspace.fs`; convert all paths with `vscode.Uri`, not string concatenation.
4. Reuse core path validation before every read or write.
5. Implement `Validate Project` first. It proves project discovery, reads, core validation, diagnostics, and user feedback without writes.
6. Add project initialization, section creation, and image insertion one command at a time.
7. Register context-menu entries only after their corresponding commands work through the Command Palette.

#### Important Rules

- Never use Node `fs` directly for workspace files. Use `vscode.workspace.fs` so remote workspaces remain possible.
- Treat multiple workspace folders as an explicit policy decision. Initial implementation should either support one identified Clear Writer root or show a clear picker; it must not silently choose the wrong workspace.
- Watch `settings.json`, `sections/`, and `images/` for external changes. Debounce invalidation and never assume the extension was the writer.
- Avoid recreating the Explorer. The extension adds document semantics, not a second file browser.

#### Tests To Add

- Extension-host test: discover a fixture project from an opened workspace.
- Extension-host test: validate malformed settings and publish diagnostics.
- Extension-host test: create a section and verify its normalized path and order.
- Unit tests for project-root selection in single-root and multi-root workspaces.

#### Completion Checklist

- A real project opens in VS Code without browser storage concepts.
- Project validation uses core rules and reports actionable diagnostics.
- Basic project mutation commands operate through workspace APIs and survive remote-workspace testing.

### Phase 3 Playbook: Settings Editor

#### What To Read

Read these current files as behavioral references:

1. `src/ui/components/SettingsDrawer.ts` for the current settings categories.
2. `src/ui/components/PageSetupDrawer.ts`
3. `src/ui/components/TypographyDrawer.ts`
4. `src/ui/components/ListsDrawer.ts`
5. `src/ui/components/TablesDrawer.ts`
6. `src/ui/components/TocSetupDrawer.ts`
7. `src/ui/components/SpecialHeadingsDrawer.ts`
8. `src/ui/components/EditorSettingsDrawer.ts`
9. `src/ui/components/CustomStylesDrawerTemplate.ts`
10. `src/ui/components/ProjectMetadataDrawer.ts`
11. `src/ui/*-setup.ts` modules for UI-to-settings update behavior.
12. `src/services/SettingsService.ts` and `src/services/project-settings.ts` for persistence rules.

Read these to understand visual behavior only; do not copy their DOM markup or drawer lifecycle into the extension.

#### Destination Layout

```text
packages/vscode-extension/src/
  panels/
    settingsPanel.ts
  services/
    settingsEditorService.ts
  webview/
    settings/
      index.ts
      settingsApp.ts
      state.ts
      messages.ts
      sections/
        overviewSection.ts
        pageLayoutSection.ts
        typographySection.ts
        contentsSection.ts
        componentsSection.ts
        editorSection.ts
      styles.css
```

Keep the webview bundle isolated from extension-host code. `messages.ts` defines typed request and response messages shared by both sides.

#### Step-By-Step Work

1. Implement a read-only settings panel that renders normalized settings from the extension host.
2. Add one editable category first, preferably Project Metadata or Page Layout.
3. On every edit, send a small intent message such as `updatePageMargins`; do not send unrestricted JSON replacement requests.
4. Validate and normalize in `settingsEditorService.ts` using core APIs.
5. Write settings atomically through the workspace adapter.
6. Return saved settings and errors to the webview.
7. Add dirty state, save/revert, and external change detection.
8. Add remaining categories incrementally, with one test set per category.

#### Required UX Details

- Each input needs a visible label and keyboard focus order.
- Field errors must explain the accepted range or format.
- Save must be disabled only when there is nothing to save, not as a substitute for validation feedback.
- Reset actions must describe their scope, for example `Reset Typography to project defaults`.
- Use VS Code CSS variables such as `--vscode-editor-background`; do not hard-code a light or dark palette.
- Include a direct `Open settings.json` action for advanced users.

#### Tests To Add

- Unit tests for every message handler and settings update operation.
- Webview tests for required labels, validation display, dirty state, Save, Revert, and keyboard navigation.
- Extension-host test that direct external modification of `settings.json` refreshes the panel state.
- Contract test ensuring settings written by the UI pass the same core normalization as settings read from disk.

#### Completion Checklist

- All settings currently exposed in drawers can be edited in the form.
- The extension host is the only code path that writes `settings.json` from the form.
- The form does not require or imitate animated drawer behavior.

### Phase 4 Playbook: Paginated Preview

#### What To Read

Read these modules in this order:

1. `src/preview/PreviewController.ts` for render scheduling and fast/exact render behavior.
2. `src/preview/RenderEngine.ts` for Paged.js lifecycle and errors.
3. `src/preview/PagedJsAdapter.ts` for Paged.js integration boundaries.
4. `src/preview/CssGenerator.ts` for layout/style generation.
5. `src/preview/PreviewViewport.ts` for responsive preview viewport behavior.
6. `src/preview/document-rendering/*` for section composition.
7. `src/images/imageSources.ts` and `src/images/markdownImages.ts` for asset handling.
8. `src/preview/headingNumbering.ts`, `src/preview/tableOfContents.ts`, and `src/preview/specialHeadings.ts`.
9. `src/ui/components/PreviewPanel.ts` only for the current controls and user interactions.

#### Destination Layout

```text
packages/vscode-extension/src/
  panels/
    previewPanel.ts
  services/
    previewDocumentService.ts
    previewAssetService.ts
  webview/
    preview/
      index.ts
      previewApp.ts
      pagedRenderer.ts
      messages.ts
      styles.css
```

The extension host compiles the document and resolves workspace asset paths. The webview receives sanitized HTML, generated CSS, and approved webview resource URIs. The webview owns DOM insertion and Paged.js execution only.

#### Step-By-Step Work

1. Implement a static preview of the complete project fixture.
2. Add preview refresh on explicit command.
3. Add file watching and debounced refresh when Markdown, settings, or images change.
4. Add active-section mode.
5. Add zoom and document/section controls.
6. Add revision-aware preview navigation after the static rendering path is stable.
7. Profile rendering before attempting any fast-lane optimization.

#### Security And Reliability Rules

- Use a strict webview content security policy and a per-panel nonce.
- Set `localResourceRoots` to the project images directory and extension webview assets only.
- Convert all asset references through `webview.asWebviewUri`; do not expose raw local paths.
- Treat image load failures as diagnostics and visible preview feedback, not a reason to crash rendering.
- Dispose preview subscriptions when the panel closes.

#### Tests To Add

- Core snapshot test for HTML and CSS generation from the complex fixture.
- Webview integration test for paginated render completion.
- Extension-host test confirming a settings change requests a preview refresh.
- Asset test covering nested image paths, missing images, and remote-workspace URI conversion.
- Performance budget test using a realistic multi-section fixture.

#### Completion Checklist

- Preview fidelity is measured against the PWA baseline, not judged only by manual inspection.
- Local paths never appear in webview HTML.
- The preview remains responsive during ordinary Markdown edits.

### Phase 5 Playbook: DOCX And PDF Export

#### What To Read

Read these current files:

1. `src/services/ExportSnapshotService.ts`
2. `src/services/ExportDocxService.ts`
3. `src/platform/BrowserExportService.ts`
4. `src/platform/pdf-print-css.ts`
5. `src/boot/app.ts` export wiring.
6. `docs/user/exporting.md`
7. Existing export tests named in `docs/DOCUMENTATION_MAP.md`.

Separate the two export paths while reading. The DOCX logic is document transformation plus file writing. The current PDF logic is browser print behavior and should not determine the extension PDF implementation.

#### Destination Layout

```text
packages/vscode-extension/src/
  commands/
    exportDocx.ts
    exportHtml.ts
    exportPdf.ts
  services/
    exportService.ts
    docxExportService.ts
    htmlExportService.ts
    pdfExportService.ts
```

The `exportService.ts` module coordinates project loading, save/flush checks, progress, destination selection, and error reporting. Format-specific modules do not call VS Code UI APIs directly.

#### DOCX Step-By-Step Work

1. Make DOCX conversion run from the core and a Node asset resolver using the complex fixture.
2. Add a command that writes to a temporary file and verifies its ZIP structure in a test.
3. Add `showSaveDialog` only after conversion is stable.
4. Add progress reporting for image preparation and conversion.
5. Add a final notification containing the output path and an `Open` action.
6. Compare output to the baseline fixture after every major conversion change.

#### PDF Step-By-Step Work

1. Implement print-ready HTML export first; it should reuse the same document snapshot as DOCX and preview.
2. Create a short architecture decision record comparing renderer choices: bundled Chromium/Playwright, installed browser invocation, external service, and pure Node PDF engine.
3. Prototype the selected renderer against the complex fixture before committing to package integration.
4. Measure output fidelity, extension package size, first-run time, offline behavior, and platform support.
5. Add PDF export only after the prototype meets agreed thresholds.

#### Tests To Add

- DOCX conversion unit tests for headings, tables, lists, images, headers/footers, metadata, and custom blocks.
- Integration test that writes a DOCX to a temporary directory.
- HTML export snapshot tests.
- PDF visual comparison tests after a renderer is selected.
- Cancellation and error-path tests for missing images, unwritable destinations, and malformed settings.

#### Completion Checklist

- DOCX is production-ready independently of PDF.
- PDF scope and renderer choice are documented, not assumed.
- Export uses a durable project snapshot and reports errors without losing author work.

### Phase 6 Playbook: Navigation, Review, And Editor Integration

#### What To Read

Read these files:

1. `src/ui/sidebar/SidebarController.ts` and all `src/ui/sidebar/*` modules.
2. `src/ui/document-outline.ts`.
3. `src/ui/project-search.ts` and `src/services/project-search.ts`.
4. `src/ui/project-review.ts` and `src/services/project-review.ts`.
5. `src/ui/keyboard-shortcuts.ts`.
6. `src/editor/markdown-commands.ts`.
7. `src/editor/section-templates.ts`.
8. `src/ui/components/EditorPanel.ts`.

Classify each interaction as one of these before implementing it: native VS Code feature, command, tree item, diagnostic/code action, editor action, or a feature to retire.

#### Destination Layout

```text
packages/vscode-extension/src/
  providers/
    clearWriterTreeProvider.ts
    documentOutlineProvider.ts
  diagnostics/
    reviewDiagnostics.ts
  codeActions/
    clearWriterCodeActionProvider.ts
  commands/
    insertToc.ts
    insertProjectImage.ts
    applyBlockStyle.ts
    createFromTemplate.ts
```

#### Step-By-Step Work

1. Implement review findings as diagnostics before building a custom review panel.
2. Register code actions for fixes that can be made safely and deterministically.
3. Add a minimal tree view containing document order and section flags only.
4. Add editor actions for the highest-value document commands.
5. Confirm whether native Search and Outline satisfy ordinary use cases before adding any custom replacement.
6. Add keyboard shortcuts only after commands are stable, and make all keybindings overridable.

#### Tests To Add

- Unit tests for review-to-diagnostic conversion and source ranges.
- Extension-host tests for code actions and tree refreshes after file changes.
- Command tests for Markdown insertion and section template behavior.

#### Completion Checklist

- The extension supplements rather than duplicates VS Code navigation.
- Review feedback appears in the Problems panel with useful source locations.
- The most common Clear Writer actions are accessible through the Command Palette and keyboard.

### Phase 7 Playbook: Hardening, Distribution, And Transition

#### What To Read

Read these files and artifacts:

1. `package.json` and all current scripts under `scripts/`.
2. Every relevant test in `test/` for settings, exports, preview, workspace behavior, and smoke coverage.
3. `public/manifest.webmanifest`, `public/sw.js`, and `src/sw-registration.ts` to identify PWA-only release responsibilities that do not transfer to the extension.
4. `docs/README.md` and `docs/DOCUMENTATION_MAP.md` to update project documentation ownership.
5. The VS Code Marketplace packaging and extension security guidance before public publication.

#### Destination Layout

```text
packages/vscode-extension/
  package.json
  README.md
  CHANGELOG.md
  LICENSE
  .vscodeignore
  test/
    integration/
    fixtures/
  scripts/
    package-check.mjs
    visual-regression.mjs
```

#### Step-By-Step Work

1. Add a CI matrix for core tests, extension-host tests, packaging, and artifact checks.
2. Test Windows, macOS, and Linux before declaring desktop support.
3. Test local, SSH, WSL, and container workspaces for every command that reads or writes project files.
4. Test light, dark, and high-contrast themes for every webview.
5. Establish an extension size budget before bundling a PDF renderer.
6. Create a private VSIX pilot channel before Marketplace release.
7. Write a migration guide that explains how existing PWA folder projects open in VS Code and how users can return to the PWA if needed.
8. Run a pilot with real project files and record every fidelity gap as a prioritized issue.

#### Release Checklist

- All core, extension-host, and visual regression tests pass.
- The package contains no development-only files, test fixtures, browser build output, or unnecessary renderer binaries.
- Workspace trust behavior is documented and tested.
- Webview content security policies and resource roots are reviewed.
- The extension does not alter existing projects during activation or validation.
- The PWA remains available until pilot exit criteria are met.
