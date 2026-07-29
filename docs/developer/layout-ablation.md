# Pagination CSS and layout ablation

Run the layout comparison with:

```powershell
node scripts/profile-pagination.mjs --layout-profile --layout-pages 260 --samples 1 --output reports/layout-profile-260.json
```

The 260-page results are summarized in `reports/layout-ablation-summary.json`.

Margin boxes reduced total time from 1.13 seconds to 0.87 seconds when disabled, without changing the page count. Forced-break and minimal-page CSS variants reduced the page count substantially, so they are structural requirements rather than safe performance switches.

The next optimization target is repeated header/footer margin materialization and its interaction with Paged.js layout. Any change must preserve headers, footers, chapter substitutions, page numbers, and the final page count.

## Populated margin-cell regression

The layout profiler now covers sparse populated margins (header image and
page-number footer) and all six populated header/footer cells. Both preserve
page count, final-page content, header image rendering, and iframe cleanup.

| Pages | Sparse populated margins | All six populated cells | Additional pagination cost |
| --- | ---: | ---: | ---: |
| 260 | 722 ms | 788 ms | 66 ms |
| 300 | 945 ms | 1,025 ms | 80 ms |

The all-cell cost is approximately 0.25–0.27 ms per page. It is measurable but
not sufficient to justify a riskier header/footer rendering architecture. The
production optimization remains conditional CSS emission: unused margin boxes
and their selectors are absent, while populated cells retain the existing
isolated rendering path. Reports are stored in
`reports/layout-profile-populated-margins-260.json` and
`reports/layout-profile-populated-margins-300.json`.
