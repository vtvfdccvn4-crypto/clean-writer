# Preview Source Navigation

Clear Writer maps the active CodeMirror cursor line to the paginated preview through compiler-provided source anchors. This is intentionally separate from the fast preview patching path: only the committed Paged.js DOM determines which page is displayed.

## Source-Anchor Contract

The compiler adds these attributes to top-level Markdown blocks and list items:

- `data-source-id`: stable identifier within one compilation.
- `data-source-start`: first Markdown line represented by the block.
- `data-source-end`: final Markdown line represented by the block.

Navigation selects the smallest range that contains the editor line. For blank Markdown lines, it selects the closest preceding block. Paged.js may fragment one source block across multiple pages; the preview index retains every rendered fragment under the same source ID.

## Render Timing

The preview uses a fast lane for responsive text updates and an exact Paged.js lane for final pagination. Cursor navigation is deferred while exact pagination is pending, then replayed only after the latest render commits. This prevents a click from navigating according to page positions that existed before an image, page break, or structural Markdown change.

## Positioning

The preview navigator centers the resolved block using the scroll container's measured geometry. It does not call `scrollIntoView` on the full Paged.js page, because that loses the requested block position and is unreliable when the preview stage is CSS-scaled.

## Regression Coverage

Changes in this area must preserve coverage for:

- cursor lines inside multi-line paragraphs and list items;
- blank-line fallback;
- images that cause later blocks to move to another page;
- source blocks split across page boundaries;
- reduced-width, scaled preview layouts;
- navigation requested while an exact render is waiting or running.

The focused browser fixture is `test/fixtures/source-anchor-navigation.ts`; it verifies source-range lookup and the target-centering geometry. The release browser smoke suite runs it with the wider authoring, pagination, and responsive-layout checks.
