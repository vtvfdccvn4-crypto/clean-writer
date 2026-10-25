import { escapeHtml } from '../utils/escapeHtml';

/**
 * The document outline as a keyboard-operable list of buttons. One item is in
 * the tab order at a time (a roving tab stop), and the arrow, Home and End keys
 * move between items. Each section's markup is kept, so a save replaces only the
 * sections that changed, and focus and scroll position survive the update.
 */

export interface OutlineHeading {
  readonly level: number;
  readonly text: string;
  readonly line: number;
}

export type OutlineActivation =
  | { readonly action: 'section'; readonly path: string }
  | { readonly action: 'heading'; readonly path: string; readonly line: number };

export interface OutlineSectionChunk {
  /** Stable identity of the section, for example `section:chapter-1.md`. */
  readonly key: string;
  readonly html: string;
}

export interface OutlineView {
  render(chunks: readonly OutlineSectionChunk[]): void;
  clear(): void;
}

const ITEM_SELECTOR = '[data-outline-item]';

/** Markup for one section: its name, then its headings. Every value is escaped. */
export function outlineSectionHtml(path: string, sectionName: string, headings: readonly OutlineHeading[]): string {
  const escapedPath = escapeHtml(path);
  // A heading's identity is its text and which occurrence of that text it is,
  // not its line: a line moves whenever anything above it is edited, but focus
  // should stay on the same heading.
  const occurrences = new Map<string, number>();
  const headingItems = headings.map(heading => {
    const indent = (heading.level - 1) * 12 + 12;
    const text = heading.text || '(empty heading)';
    const occurrence = occurrences.get(text) ?? 0;
    occurrences.set(text, occurrence + 1);
    const identity = escapeHtml(`${text}\u0001${occurrence}`);
    return `<button type="button" class="document-outline-heading" data-outline-item data-action="heading" data-key="heading:${escapedPath}:${identity}" data-path="${escapedPath}" data-line="${heading.line}" style="padding-left: ${indent}px">${escapeHtml(text)}</button>`;
  }).join('');
  return `<div class="document-outline-section"><button type="button" class="document-outline-section-name" data-outline-item data-action="section" data-key="section:${escapedPath}" data-path="${escapedPath}">${escapeHtml(sectionName)}</button>${headingItems}</div>`;
}

export function createOutlineView(content: HTMLElement, onActivate: (activation: OutlineActivation) => void): OutlineView {
  const rendered = new Map<string, { html: string; node: HTMLElement }>();
  let rovingKey: string | null = null;

  const items = (): HTMLElement[] => Array.from(content.querySelectorAll<HTMLElement>(ITEM_SELECTOR));

  const setRovingItem = (item: HTMLElement | undefined) => {
    for (const candidate of items()) candidate.tabIndex = candidate === item ? 0 : -1;
    rovingKey = item?.dataset.key ?? null;
  };

  const itemFrom = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const item = target.closest<HTMLElement>(ITEM_SELECTOR);
    return item && content.contains(item) ? item : null;
  };

  content.addEventListener('click', event => {
    const item = itemFrom(event.target);
    if (!item?.dataset.path) return;
    setRovingItem(item);
    if (item.dataset.action === 'section') {
      onActivate({ action: 'section', path: item.dataset.path });
    } else {
      onActivate({ action: 'heading', path: item.dataset.path, line: Number(item.dataset.line) || 1 });
    }
  });

  content.addEventListener('focusin', event => {
    const item = itemFrom(event.target);
    if (item) setRovingItem(item);
  });

  content.addEventListener('keydown', event => {
    const current = itemFrom(event.target);
    if (!current) return;
    const all = items();
    const index = all.indexOf(current);
    let next: number;
    switch (event.key) {
      case 'ArrowDown': next = Math.min(all.length - 1, index + 1); break;
      case 'ArrowUp': next = Math.max(0, index - 1); break;
      case 'Home': next = 0; break;
      case 'End': next = all.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const target = all[next];
    setRovingItem(target);
    target.focus();
  });

  return {
    render(chunks) {
      const focused = itemFrom(document.activeElement);
      const focusedKey = focused?.dataset.key ?? null;
      const focusedIndex = focused ? items().indexOf(focused) : -1;
      const scrollTop = content.scrollTop;
      const live = new Set<string>();
      const nodes: HTMLElement[] = [];
      for (const chunk of chunks) {
        live.add(chunk.key);
        let entry = rendered.get(chunk.key);
        if (!entry || entry.html !== chunk.html) {
          const template = document.createElement('template');
          template.innerHTML = chunk.html;
          entry = { html: chunk.html, node: template.content.firstElementChild as HTMLElement };
          rendered.set(chunk.key, entry);
        }
        nodes.push(entry.node);
      }
      for (const key of [...rendered.keys()]) {
        if (!live.has(key)) rendered.delete(key);
      }
      // Moving a retained section detaches its focused item, so focus is put back below.
      content.replaceChildren(...nodes);

      const all = items();
      // A heading whose line moved gets a new key. Then focus stays at the same
      // position in the outline, which is where the user was looking.
      const restored = all.find(item => item.dataset.key === focusedKey)
        ?? (focusedIndex >= 0 ? all[Math.min(focusedIndex, all.length - 1)] : undefined)
        ?? all.find(item => item.dataset.key === rovingKey)
        ?? all[0];
      setRovingItem(restored);
      if (focusedKey !== null && restored) restored.focus({ preventScroll: true });
      content.scrollTop = scrollTop;
    },
    clear() {
      rendered.clear();
      rovingKey = null;
      content.replaceChildren();
    }
  };
}
