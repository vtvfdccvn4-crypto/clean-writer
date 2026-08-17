# Preview CSS boundaries

The CSS generators in this folder share document-feature rules between live and
paginated preview. Their options only add rendering-specific behavior such as
page breaks and Paged.js page counters.

Remaining `!important` declarations are intentional in three cases:

- Paged.js-generated page and margin-box rules must win over its injected styles.
- User typography and special-heading settings must win over browser and Paged.js defaults.
- Structural resets such as image-only paragraph margins and generated pseudo-content must win over document-theme defaults.

New rules should prefer selector ownership and component boundaries first. Add
`!important` only when one of these external style sources is the reason.
