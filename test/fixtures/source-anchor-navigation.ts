import { ScrollSync } from '/src/preview/ScrollSync.ts';
import type { PageSetup } from '/src/state.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
  }
}

const pageSetup: PageSetup = {
  paperWidth: 210,
  paperHeight: 297,
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 20,
  marginRight: 20
};

const viewport = document.getElementById('preview-scroll')!;
const stage = document.getElementById('paged-stage')!;
const page = document.createElement('article');
page.className = 'pagedjs_page';
const paragraph = document.createElement('p');
paragraph.dataset.sourceId = 'source-40-44-0';
paragraph.dataset.sourceStart = '40';
paragraph.dataset.sourceEnd = '44';
paragraph.textContent = 'A multi-line paragraph after an image.';
page.append(paragraph);
stage.append(page);

Object.defineProperties(viewport, {
  clientHeight: { configurable: true, value: 400 },
  scrollHeight: { configurable: true, value: 2_000 },
  scrollTop: { configurable: true, writable: true, value: 0 }
});
viewport.scrollTo = function scrollTo(options: ScrollToOptions): void {
  this.scrollTop = options.top ?? 0;
};
viewport.getBoundingClientRect = () => new DOMRect(0, 100, 600, 400);
paragraph.getBoundingClientRect = () => new DOMRect(0, 700, 500, 80);
page.getBoundingClientRect = () => new DOMRect(0, 600, 500, 1_000);

const sync = new ScrollSync(stage, pageSetup);
sync.scrollToLine(42, false);

window.__HARNESS_RESULT__ = {
  ok: viewport.scrollTop === 440,
  scrollTop: viewport.scrollTop
};
