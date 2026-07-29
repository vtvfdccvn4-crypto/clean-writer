# Shell Refactor

This note documents the current shell and panel structure in Clear Writer.

## Goals

- Keep the shell structure explicit and easy to reason about.
- Separate shared defaults from component-specific styling.
- Reduce cross-component coupling in the UI.

## Current Panel Layout

The visible workspace is being organized around three named regions:

- `project-panel`: the left activity rail and project controls.
- `task-panel`: the section/image explorer and task surface.
- `shared-panel`: the editor/preview surface.

These names are reflected in the shell markup and workspace grid.

Current structure notes:

- `task-panel` now uses the same header/content/footer shell pattern as the editor and preview panes.
- `shared-panel` contains the editor and preview as equal-width subpanels, so it owns the 50/50 split internally.
- The task-panel header now exposes the main project actions on the right side: new project, open project, close project, and project metadata.

## Styling Rules

The refactor is using a stricter style split:

- `src/ui/styles/global-defaults.css` holds shared values such as background colors, accent colors, border radii, and font defaults.
- `src/ui/styles/activity-bar.css` owns the left rail styling.
- `src/ui/styles/editor.css` owns the task/editor panel styling.
- `src/ui/styles/preview.css` owns the shared/preview panel styling.
- `src/ui/styles/workspace.css` owns the outer shell grid and panel placement.

The intent is to avoid large global style sheets that mix unrelated shell concerns.

## Behavior Boundaries

The refactor also prefers direct behavior wiring over indirect DOM chaining.

Examples:

- Welcome screen actions should call project-open logic directly.
- Panel behavior should live with the panel it controls.
- Shared defaults should not contain component-specific layout rules.

## Inline Custom Style Contract

Custom inline styles apply only these visual properties to matched content:

- text color,
- bold weight,
- italic style.

Font family and font size stored in older custom-style records are retained for
settings compatibility but are not emitted by the editor highlighter, Markdown
preview compiler, or print CSS compiler. The relevant application paths are:

- `src/editor/extensions/customStyleHighlighting.ts`
- `src/compiler/remark-plugins/customStyles.ts`
- `src/print/PrintCssCompiler.ts`

## Source References

- `src/ui/components/AppShell.ts`
- `src/ui/components/EditorPanel.ts`
- `src/ui/components/PreviewPanel.ts`
- `src/ui/styles/global-defaults.css`
- `src/ui/styles/activity-bar.css`
- `src/ui/styles/editor.css`
- `src/ui/styles/preview.css`
- `src/ui/styles/workspace.css`
