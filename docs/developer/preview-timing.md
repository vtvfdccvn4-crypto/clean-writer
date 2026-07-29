# Full-document preview timing

Full-document preview timing is exposed through the development-only diagnostics panel and through:

```js
window.clearWriterPerf.snapshot().previewTimings
```

To display the panel during local development, open the application with:

```text
http://localhost:5274/?preview-diagnostics=true
```

The browser performance fixture is configurable by section count:

```powershell
$env:CLEAR_WRITER_SMOKE_FIXTURE = 'browser-authoring-performance-smoke'
$env:CLEAR_WRITER_PREVIEW_SECTIONS = '260'
node scripts/release-browser-smoke.mjs
```

The current baseline is stored in `reports/preview-timing-baseline.json`. It uses synthetic projects and records actual physical page counts, so the section count should not be treated as an exact page-count input.

The current measurements show pagination as the dominant phase. At approximately 261 pages, pagination accounts for about 64% of total preview time, while compilation accounts for about 15%. Optimization work should therefore prioritize the Paged.js phase before navigation-index or DOM-index changes.

The first pagination optimization replaces hidden-frame `setTimeout(0)` yields with `MessageChannel` task yields. In the 261-page browser fixture, total preview time decreased from 3.45 seconds to 2.14 seconds, while the measured pagination phase decreased from 2.19 seconds to 0.93 seconds. The before/after data is stored in `reports/preview-timing-optimization-message-channel.json`.

Empty header/footer cells no longer emit Paged.js `@top-*` or `@bottom-*`
margin regions. This preserves populated cells while avoiding six empty layout
regions in the default document configuration. In the 261-page browser
fixture, pagination decreased from about 0.99 seconds to 0.72 seconds after
this change. The full-preview run is stored in
`reports/browser-preview-empty-margin-box-260.json`.

## Compiler breakdown

For a large full-document preview, inspect the compiler sub-phases before
attempting a compiler refactor:

- `compile-parse-markdown` is the Markdown-to-AST parser cost. It grows with
  source length and is normally the largest compiler component.
- `compile-transform-document` covers the remark/rehype plugin chain,
  sanitisation, source-anchor creation, and asset substitution.
- `compile-stringify-html` and `compile-rebase-manifest` should remain small.

The 260-section browser baseline captured on 2026-07-29 recorded 376 ms in
Markdown parsing, 136 ms in transformations, 9 ms in HTML serialisation, and
3 ms in manifest rebasing. This means caching or changing the parser requires
an explicit invalidation design; small manifest or HTML-string changes will
not materially improve preview startup.
