# UI token contract

`global-defaults.css` is the single source of truth for application UI tokens.

- `--ui-*` names are used for surfaces, text, borders, application chrome, accents, and radii.
- `--ui-accent` is the neutral text accent; `--ui-brand` is the blue interaction accent.
- Font tokens remain `--font-*` because they describe typography rather than UI color.
- Components may provide a fallback value for isolated preview/export content, but must not introduce a second application-wide token namespace.
