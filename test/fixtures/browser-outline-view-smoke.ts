import { createOutlineView, outlineSectionHtml, type OutlineActivation } from '../../src/ui/outline-view';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const chunk = (path: string, headings: Array<{ level: number; text: string; line: number }>) => ({
  key: `section:${path}`,
  html: outlineSectionHtml(path, path, headings)
});

const key = (event: Element, name: string) => event.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));

async function run(): Promise<void> {
  const content = document.getElementById('outline') as HTMLElement;
  content.style.cssText = 'height: 120px; overflow: auto;';
  const activations: OutlineActivation[] = [];
  const view = createOutlineView(content, activation => activations.push(activation));

  const alpha = [
    chunk('alpha.md', [{ level: 1, text: 'Alpha heading', line: 2 }, { level: 2, text: 'Alpha detail', line: 6 }])
  ];
  const beta = [chunk('beta.md', Array.from({ length: 30 }, (_, index) => ({ level: 1, text: `Beta ${index}`, line: index + 1 })))];
  view.render([...alpha, ...beta]);

  const items = () => Array.from(content.querySelectorAll<HTMLElement>('[data-outline-item]'));
  const buttons = items().every(item => item.tagName === 'BUTTON');
  const oneTabStop = items().filter(item => item.tabIndex === 0).length === 1;

  // Keyboard: arrows and Home/End move focus between items.
  items()[0].focus();
  key(items()[0], 'ArrowDown');
  const movedDown = document.activeElement === items()[1];
  key(items()[1], 'ArrowUp');
  const movedUp = document.activeElement === items()[0];
  key(items()[0], 'End');
  const endIsLast = document.activeElement === items().at(-1);
  key(items().at(-1)!, 'Home');
  const homeIsFirst = document.activeElement === items()[0];

  // Activation reports the section or heading, with its line.
  items()[1].click();
  const activatedHeading = activations.at(-1)?.action === 'heading' && (activations.at(-1) as { line: number }).line === 2;
  items()[0].click();
  const activatedSection = activations.at(-1)?.action === 'section';

  // Re-rendering with unchanged content keeps the same nodes.
  const beforeNodes = items();
  view.render([...alpha, ...beta]);
  const sameNodes = items().every((item, index) => item === beforeNodes[index]);

  // Focus and scroll survive a save that changes only Beta.
  const betaChanged = [chunk('beta.md', Array.from({ length: 30 }, (_, index) => ({ level: 1, text: `Beta revised ${index}`, line: index + 1 })))];
  // Focusing an item scrolls it into view, so the scroll position is read after focusing.
  const focusTarget = items().find(item => item.textContent === 'Beta 19')!;
  focusTarget.focus();
  content.scrollTop = 150;
  const scrollBefore = content.scrollTop;
  view.render([...alpha, ...betaChanged]);
  const focusKept = document.activeElement?.textContent === 'Beta revised 19';
  const scrollKept = Math.abs(content.scrollTop - scrollBefore) <= 1;
  const alphaNodeKept = items()[0] === beforeNodes[0];

  // A heading that moves to a new line keeps focus on that heading.
  const shiftedBeta = [chunk('beta.md', Array.from({ length: 30 }, (_, index) => ({ level: 1, text: `Beta revised ${index}`, line: index + 2 })))];
  view.render([...alpha, ...shiftedBeta]);
  const positionKept = document.activeElement?.textContent === 'Beta revised 19';

  // Clearing empties the list and leaves no stale tab stop.
  view.clear();
  const cleared = items().length === 0;

  window.__HARNESS_RESULT__ = {
    ok: buttons && oneTabStop && movedDown && movedUp && endIsLast && homeIsFirst && activatedHeading && activatedSection
      && sameNodes && focusKept && scrollKept && alphaNodeKept && positionKept && cleared,
    buttons, oneTabStop, movedDown, movedUp, endIsLast, homeIsFirst, activatedHeading, activatedSection,
    sameNodes, focusKept, scrollKept, alphaNodeKept, positionKept, cleared
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
