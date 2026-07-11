import type { MarkdownEditor } from '../editor';
import { closeDrawer, openDrawer } from './drawer-manager';

type SymbolGroupId =
  | 'technical'
  | 'arrows'
  | 'math'
  | 'bullets'
  | 'dingbats'
  | 'currency'
  | 'greek'
  | 'punctuation';

interface SymbolItem {
  symbol: string;
  name: string;
  group: SymbolGroupId;
}

interface SymbolGroup {
  id: SymbolGroupId;
  label: string;
}

interface SymbolPickerElements {
  drawer: HTMLElement;
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  search: HTMLInputElement;
  recent: HTMLElement;
  categories: HTMLElement;
  empty: HTMLElement;
  clearRecents: HTMLButtonElement;
}

const STORAGE_KEY = 'clear-writer-symbol-picker-recents';
const MAX_RECENTS = 12;

const SYMBOL_GROUPS: SymbolGroup[] = [
  { id: 'technical', label: 'Technical Writing' },
  { id: 'arrows', label: 'Arrows' },
  { id: 'math', label: 'Math' },
  { id: 'bullets', label: 'Bullets' },
  { id: 'dingbats', label: 'Dingbats' },
  { id: 'currency', label: 'Currency' },
  { id: 'greek', label: 'Greek' },
  { id: 'punctuation', label: 'Punctuation' }
];

const SYMBOLS: SymbolItem[] = [
  // Technical Writing (Top group)
  { symbol: '→', name: 'Right arrow', group: 'technical' },
  { symbol: '←', name: 'Left arrow', group: 'technical' },
  { symbol: '↑', name: 'Up arrow', group: 'technical' },
  { symbol: '↓', name: 'Down arrow', group: 'technical' },
  { symbol: '✓', name: 'Check mark', group: 'technical' },
  { symbol: '✕', name: 'Multiply cross', group: 'technical' },
  { symbol: '•', name: 'Bullet', group: 'technical' },
  { symbol: '±', name: 'Plus-minus', group: 'technical' },
  { symbol: '°', name: 'Degree', group: 'technical' },
  { symbol: '§', name: 'Section sign', group: 'technical' },
  { symbol: '¶', name: 'Pilcrow', group: 'technical' },
  { symbol: '©', name: 'Copyright', group: 'technical' },
  { symbol: '®', name: 'Registered', group: 'technical' },
  { symbol: '™', name: 'Trademark', group: 'technical' },
  
  // Arrows
  { symbol: '↔', name: 'Left-right arrow', group: 'arrows' },
  { symbol: '⇐', name: 'Double left arrow', group: 'arrows' },
  { symbol: '⇒', name: 'Double right arrow', group: 'arrows' },
  { symbol: '⇔', name: 'Double arrow', group: 'arrows' },

  // Math
  { symbol: '×', name: 'Multiply', group: 'math' },
  { symbol: '÷', name: 'Divide', group: 'math' },
  { symbol: '≈', name: 'Approximately equal', group: 'math' },
  { symbol: '≠', name: 'Not equal', group: 'math' },
  { symbol: '≤', name: 'Less than or equal', group: 'math' },
  { symbol: '≥', name: 'Greater than or equal', group: 'math' },
  { symbol: '∞', name: 'Infinity', group: 'math' },
  { symbol: '√', name: 'Square root', group: 'math' },
  { symbol: '∑', name: 'Summation', group: 'math' },

  // Bullets
  { symbol: '◦', name: 'White bullet', group: 'bullets' },
  { symbol: '▪', name: 'Small square bullet', group: 'bullets' },
  { symbol: '▫', name: 'White square bullet', group: 'bullets' },
  { symbol: '·', name: 'Middle dot', group: 'bullets' },
  { symbol: '‣', name: 'Triangular bullet', group: 'bullets' },

  // Dingbats
  { symbol: '★', name: 'Black star', group: 'dingbats' },
  { symbol: '☆', name: 'White star', group: 'dingbats' },
  { symbol: '◆', name: 'Black diamond', group: 'dingbats' },
  { symbol: '◇', name: 'White diamond', group: 'dingbats' },

  // Punctuation
  { symbol: '¿', name: 'Inverted question mark', group: 'punctuation' },
  { symbol: '¡', name: 'Inverted exclamation mark', group: 'punctuation' },

  // Currency
  { symbol: '¢', name: 'Cent', group: 'currency' },
  { symbol: '£', name: 'Pound', group: 'currency' },
  { symbol: '€', name: 'Euro', group: 'currency' },
  { symbol: '¥', name: 'Yen', group: 'currency' },
  { symbol: '₹', name: 'Rupee', group: 'currency' },

  // Greek
  { symbol: 'α', name: 'Alpha', group: 'greek' },
  { symbol: 'β', name: 'Beta', group: 'greek' },
  { symbol: 'γ', name: 'Gamma', group: 'greek' },
  { symbol: 'δ', name: 'Delta', group: 'greek' },
  { symbol: 'λ', name: 'Lambda', group: 'greek' },
  { symbol: 'μ', name: 'Mu', group: 'greek' },
  { symbol: 'π', name: 'Pi', group: 'greek' },
  { symbol: 'Ω', name: 'Omega', group: 'greek' }
];

const normalize = (value: string): string =>
  value.toLowerCase().normalize('NFKD');

const getElements = (): SymbolPickerElements => {
  const drawer = document.querySelector<HTMLElement>('#symbol-picker');
  const openButton = document.querySelector<HTMLButtonElement>('#open-symbol-picker');
  const closeButton = document.querySelector<HTMLButtonElement>('#close-symbol-picker');
  const search = document.querySelector<HTMLInputElement>('#symbol-picker-search');
  const recent = document.querySelector<HTMLElement>('#symbol-picker-recent');
  const categories = document.querySelector<HTMLElement>('#symbol-picker-categories');
  const empty = document.querySelector<HTMLElement>('#symbol-picker-empty');
  const clearRecents = document.querySelector<HTMLButtonElement>('#clear-symbol-picker-recents');

  if (
    !drawer ||
    !openButton ||
    !closeButton ||
    !search ||
    !recent ||
    !categories ||
    !empty ||
    !clearRecents
  ) {
    throw new Error('Symbol Picker could not be initialized.');
  }

  return {
    drawer,
    openButton,
    closeButton,
    search,
    recent,
    categories,
    empty,
    clearRecents
  };
};

const loadRecentSymbols = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const saveRecentSymbols = (symbols: string[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols.slice(0, MAX_RECENTS)));
};

const makeButton = (
  item: SymbolItem,
  onPick: (symbol: string) => void,
  isRecent = false
): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = isRecent ? 'symbol-tile symbol-tile-recent' : 'symbol-tile';
  button.dataset.symbol = item.symbol;
  button.dataset.symbolName = `${item.name} ${item.symbol}`;
  button.setAttribute('aria-label', `Insert ${item.name}`);
  button.title = `${item.name} (${item.symbol})`;

  const glyph = document.createElement('span');
  glyph.className = 'symbol-tile-glyph';
  glyph.textContent = item.symbol;
  button.append(glyph);
  button.addEventListener('click', () => onPick(item.symbol));
  return button;
};

export const initializeSymbolPicker = (getEditor: () => MarkdownEditor | null): void => {
  const elements = getElements();
  let recentSymbols = loadRecentSymbols();
  const symbolByValue = new Map(SYMBOLS.map((item) => [item.symbol, item]));

  const syncOpenState = (isOpen: boolean): void => {
    elements.openButton.setAttribute('aria-expanded', String(isOpen));
  };

  const renderRecent = (): void => {
    elements.recent.replaceChildren();
    const items = recentSymbols
      .map((symbol) => symbolByValue.get(symbol))
      .filter((item): item is SymbolItem => Boolean(item));

    if (!items.length) {
      const placeholder = document.createElement('p');
      placeholder.className = 'field-help symbol-picker-empty';
      placeholder.textContent = 'Recently used symbols will appear here.';
      elements.recent.append(placeholder);
      return;
    }

    for (const item of items) {
      elements.recent.append(makeButton(item, pickSymbol, true));
    }
  };

  const renderCategories = (): void => {
    elements.categories.replaceChildren();

    for (const group of SYMBOL_GROUPS) {
      const section = document.createElement('section');
      section.className = 'symbol-group';
      section.dataset.group = group.id;

      const heading = document.createElement('h4');
      heading.className = 'symbol-group-title';
      heading.textContent = group.label;

      const grid = document.createElement('div');
      grid.className = 'symbol-grid';

      for (const item of SYMBOLS.filter((symbol) => symbol.group === group.id)) {
        const button = makeButton(item, pickSymbol);
        grid.append(button);
      }

      section.append(heading, grid);
      elements.categories.append(section);
    }
  };

  const applySearch = (): void => {
    const query = normalize(elements.search.value.trim());
    let visibleCount = 0;

    for (const button of elements.drawer.querySelectorAll<HTMLButtonElement>('.symbol-tile')) {
      const item = symbolByValue.get(button.dataset.symbol ?? '');
      if (!item) continue;
      const matches =
        !query ||
        normalize(item.name).includes(query) ||
        normalize(item.symbol).includes(query) ||
        normalize(item.group).includes(query);
      button.hidden = !matches;
      if (matches) visibleCount += 1;
    }

    for (const section of elements.categories.querySelectorAll<HTMLElement>('.symbol-group')) {
      const hasVisible = Array.from(section.querySelectorAll<HTMLButtonElement>('.symbol-tile'))
        .some((button) => !button.hidden);
      section.hidden = !hasVisible;
    }

    elements.empty.hidden = visibleCount > 0;
  };

  const updateRecentSymbols = (symbol: string): void => {
    recentSymbols = [symbol, ...recentSymbols.filter((candidate) => candidate !== symbol)];
    recentSymbols = recentSymbols.slice(0, MAX_RECENTS);
    saveRecentSymbols(recentSymbols);
    renderRecent();
    applySearch();
  };

  const close = (): void => {
    closeDrawer(elements.drawer);
    syncOpenState(false);
  };

  const open = (): void => {
    openDrawer(elements.drawer);
    syncOpenState(true);
    window.requestAnimationFrame(() => {
      elements.search.focus();
      elements.search.select();
    });
  };

  const pickSymbol = (symbol: string): void => {
    const editor = getEditor();
    if (!editor) return; // Ignore if no active editor
    editor.insertText(symbol);
    updateRecentSymbols(symbol);
    close();
    editor.focus();
  };

  elements.openButton.addEventListener('click', () => {
    if (!elements.drawer.classList.contains('hidden')) {
      close();
      return;
    }
    open();
  });
  elements.closeButton.addEventListener('click', () => close());
  elements.search.addEventListener('input', applySearch);
  elements.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Enter') return;
    const firstVisible = Array.from(
      elements.drawer.querySelectorAll<HTMLButtonElement>('.symbol-tile')
    ).find((button) => !button.hidden);
    if (!firstVisible?.dataset.symbol) return;
    event.preventDefault();
    pickSymbol(firstVisible.dataset.symbol);
  });
  elements.clearRecents.addEventListener('click', () => {
    recentSymbols = [];
    saveRecentSymbols(recentSymbols);
    renderRecent();
    applySearch();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.drawer.classList.contains('hidden')) {
      close();
    }
  });

  renderCategories();
  renderRecent();
  applySearch();
};
