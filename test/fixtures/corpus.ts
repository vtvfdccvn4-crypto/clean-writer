/**
 * The canonical 1,000-page benchmark corpus used by the keyboard-latency and
 * typing-bench fixtures. A page has headings, paragraphs, a list, and a table
 * every tenth page — enough structure to exercise the full compile and preview
 * pipeline without becoming unrealistically uniform.
 */
export const CORPUS_PAGES = 1_000;

/** Gate: no long task (>50 ms) may occur during typing on the corpus. */
export const CORPUS_LONG_TASK_BUDGET_MS = 50;

/** Gate: p95 input latency must stay at or below this on the corpus. */
export const CORPUS_P95_LATENCY_BUDGET_MS = 100;

export function corpusPage(index: number): string {
  return [
    `## Section ${index}`,
    '',
    'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit, sed do _eiusmod_ tempor incididunt ut labore. '.repeat(12),
    '',
    '- first item with `code`',
    '- second item',
    '',
    'Second paragraph with a [link](https://example.com) and more prose to fill the page. '.repeat(10),
    ...(index % 10 === 0 ? ['', '| a | b | c |', '|---|---|---|', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |'] : []),
    ''
  ].join('\n');
}

/** The full 1,000-page document as a single Markdown string. */
export const CORPUS_DOCUMENT: string = Array.from(
  { length: CORPUS_PAGES },
  (_, i) => corpusPage(i + 1)
).join('\n');
