export function isHidden(element: Element | null | undefined): boolean {
  return element?.classList.contains('hidden') === true;
}

export function getText(element: Element | null | undefined): string {
  return element?.textContent?.trim() || '';
}

export function getTexts(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector), node => getText(node));
}

export function hasText(selector: string, text: string): boolean {
  return getTexts(selector).includes(text);
}

export function getVisibleCardTitle(containerSelector: string, title: string): Element | null {
  return Array.from(document.querySelectorAll(`${containerSelector} .drawer-card`))
    .find(card => getText(card.querySelector('.drawer-card-head > span')) === title) ?? null;
}

export function getVisibleDetailsTitle(containerSelector: string, title: string): Element | null {
  return Array.from(document.querySelectorAll(`${containerSelector} .drawer-details`))
    .find(card => getText(card.querySelector('.drawer-summary > span')) === title) ?? null;
}

export async function waitFor<T>(
  label: string,
  read: () => T | null | undefined | false,
  timeoutMs = 20_000,
  options: { timeoutPrefix?: string; reportProgress?: boolean } = {}
): Promise<T> {
  if (options.reportProgress) {
    (window as typeof window & { __HARNESS_PROGRESS__?: string }).__HARNESS_PROGRESS__ = label;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const prefix = options.timeoutPrefix || 'browser smoke condition';
  throw new Error(`Timed out waiting for ${prefix}: ${label}`);
}

export async function click(selector: string): Promise<void> {
  const element = await waitFor(`selector ${selector}`, () => document.querySelector<HTMLElement>(selector));
  element.click();
}
