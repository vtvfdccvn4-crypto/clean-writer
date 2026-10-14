# UI token contract

`global-defaults.css` is the single source of truth for application UI tokens.

- `--ui-*` names are used for surfaces, text, borders, application chrome, accents, and radii.
- `--ui-accent` is the neutral text accent; `--ui-brand` is the blue interaction accent.
- Font tokens remain `--font-*` because they describe typography rather than UI color.
- Components may provide a fallback value for isolated preview/export content, but must not introduce a second application-wide token namespace.

## Drawer tokens

`drawers.css` opens with a `--drawer-*` block on `.drawer-container, .drawer`. It is the single place to change how drawers look: paint, type scale, geometry, the spacing scale, control height and padding, radii, motion and the focus ring. Every drawer rule reads from it, so no rule hard-codes a surface, border, radius, spacing step or control height.

- The tokens resolve from `--ui-*`, so drawers follow the app theme; this is a component scope, not a second application-wide namespace.
- Breakpoints redefine the tokens rather than restating rules, so responsive behaviour is a change of scale in one block.
- A drawer that genuinely needs to differ overrides a token on its own root — `#symbol-picker` in `drawers-symbol-picker.css` does this for its tile grid.
