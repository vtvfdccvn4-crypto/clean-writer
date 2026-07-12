import { APP_STATE_EVENTS, state } from '../state';
import type { ListSetup, ListStyle } from '../state';
import { bindDrawerToggleButton, getDrawerToggleButtonState, readDrawerNumber, setDrawerToggleButtonState } from './components/drawerControls';
import { DEFAULT_LIST_FONT_FAMILY, setFontFamilySelectValue } from '../config/font-families';
import { onSettingsTabActivated } from './settings-drawer';

const unorderedListKeys = ['ulAsterisk', 'ulDash', 'ulPlus'] as const;
const orderedListKeys = ['ol', 'olParen'] as const;
type UnorderedListKey = typeof unorderedListKeys[number];
type OrderedListKey = typeof orderedListKeys[number];

const cloneListStyle = (style: ListStyle): ListStyle => ({
  fontFamily: style.fontFamily || DEFAULT_LIST_FONT_FAMILY,
  fontSize: style.fontSize ?? 11,
  color: style.color || '#000000',
  isBold: !!style.isBold,
  isItalic: !!style.isItalic,
  lineHeight: style.lineHeight ?? 1.6,
  bulletIcon: style.bulletIcon || '',
  bulletColor: style.bulletColor || '#000000',
  marginLeft: style.marginLeft ?? 20,
  paddingLeft: style.paddingLeft ?? 8
});

const cloneListSetup = (setup: ListSetup): ListSetup => ({
  ulAsterisk: cloneListStyle(setup.ulAsterisk),
  ulDash: cloneListStyle(setup.ulDash),
  ulPlus: cloneListStyle(setup.ulPlus),
  ol: cloneListStyle(setup.ol),
  olParen: cloneListStyle(setup.olParen)
});

const resolveUnorderedKey = (value: string): UnorderedListKey =>
  unorderedListKeys.includes(value as UnorderedListKey) ? value as UnorderedListKey : 'ulAsterisk';

const resolveOrderedKey = (value: string): OrderedListKey =>
  orderedListKeys.includes(value as OrderedListKey) ? value as OrderedListKey : 'ol';

export function initListsDrawer(onSaveSetup: (setup: ListSetup) => Promise<void>) {
  const btnApplyLists = document.getElementById('btn-apply-lists')!;
  const unorderedSelect = document.getElementById('ul-list-style') as HTMLSelectElement;
  const orderedSelect = document.getElementById('ol-list-style') as HTMLSelectElement;

  let workingSetup = cloneListSetup(state.current.listSetup);
  let activeUnorderedKey: UnorderedListKey = 'ulAsterisk';
  let activeOrderedKey: OrderedListKey = 'ol';

  state.addEventListener('list-setup-changed', syncInputs);
  state.on(APP_STATE_EVENTS.projectSnapshotChanged, syncInputs);
  state.on(APP_STATE_EVENTS.settingsSnapshotChanged, syncInputs);

  onSettingsTabActivated('lists', syncInputs);

  ['ul-selected', 'ol-selected'].forEach(prefix => {
    bindDrawerToggleButton(`${prefix}-bold`);
    bindDrawerToggleButton(`${prefix}-italic`);
  });
  
  const readListConfig = (prefix: string): ListStyle => {
    return {
      fontFamily: (document.getElementById(`${prefix}-font`) as HTMLSelectElement).value,
      fontSize: readDrawerNumber(`${prefix}-size`, 11, { integer: true, min: 1, max: 200 }),
      color: (document.getElementById(`${prefix}-color`) as HTMLInputElement).value,
      isBold: getDrawerToggleButtonState(`${prefix}-bold`),
      isItalic: getDrawerToggleButtonState(`${prefix}-italic`),
      lineHeight: readDrawerNumber(`${prefix}-line-height`, 1.6, { min: 0.5, max: 5 }),
      bulletIcon: (document.getElementById(`${prefix}-bullet-icon`) as HTMLSelectElement).value,
      bulletColor: (document.getElementById(`${prefix}-bullet-color`) as HTMLInputElement).value,
      marginLeft: readDrawerNumber(`${prefix}-margin-left`, 20, { integer: true, min: 0, max: 200 }),
      paddingLeft: readDrawerNumber(`${prefix}-padding-left`, 8, { integer: true, min: 0, max: 200 })
    };
  };

  const syncListConfig = (prefix: string, config: ListStyle) => {
    if (!config) return;
    setFontFamilySelectValue(
      document.getElementById(`${prefix}-font`) as HTMLSelectElement,
      config.fontFamily,
      DEFAULT_LIST_FONT_FAMILY
    );
    (document.getElementById(`${prefix}-size`) as HTMLSelectElement).value = String(config.fontSize ?? 11);
    (document.getElementById(`${prefix}-color`) as HTMLInputElement).value = config.color || '#000000';
    setDrawerToggleButtonState(`${prefix}-bold`, !!config.isBold);
    setDrawerToggleButtonState(`${prefix}-italic`, !!config.isItalic);
    (document.getElementById(`${prefix}-line-height`) as HTMLInputElement).value = String(config.lineHeight ?? 1.6);
    (document.getElementById(`${prefix}-bullet-icon`) as HTMLInputElement).value = config.bulletIcon || '';
    (document.getElementById(`${prefix}-bullet-color`) as HTMLInputElement).value = config.bulletColor || '#000000';
    (document.getElementById(`${prefix}-margin-left`) as HTMLInputElement).value = String(config.marginLeft ?? 20);
    (document.getElementById(`${prefix}-padding-left`) as HTMLInputElement).value = String(config.paddingLeft ?? 8);
  };

  const storeVisibleControls = () => {
    workingSetup[activeUnorderedKey] = readListConfig('ul-selected');
    workingSetup[activeOrderedKey] = readListConfig('ol-selected');
  };

  const syncUnorderedControls = () => {
    unorderedSelect.value = activeUnorderedKey;
    syncListConfig('ul-selected', workingSetup[activeUnorderedKey]);
  };

  const syncOrderedControls = () => {
    orderedSelect.value = activeOrderedKey;
    syncListConfig('ol-selected', workingSetup[activeOrderedKey]);
  };

  function syncInputs() {
    workingSetup = cloneListSetup(state.get.listSetup);
    activeUnorderedKey = resolveUnorderedKey(unorderedSelect.value);
    activeOrderedKey = resolveOrderedKey(orderedSelect.value);
    syncUnorderedControls();
    syncOrderedControls();
  }

  unorderedSelect.addEventListener('change', () => {
    storeVisibleControls();
    activeUnorderedKey = resolveUnorderedKey(unorderedSelect.value);
    syncUnorderedControls();
  });

  orderedSelect.addEventListener('change', () => {
    storeVisibleControls();
    activeOrderedKey = resolveOrderedKey(orderedSelect.value);
    syncOrderedControls();
  });

  btnApplyLists.addEventListener('click', async () => {
    storeVisibleControls();
    const setup = cloneListSetup(workingSetup);

    state.setListSetup(setup);
    await onSaveSetup(setup);
  });

  syncInputs();
}
