import { APP_STATE_EVENTS, state } from '../state';
import type { PageSetup, TocSetup, TocStyle } from '../state';
import { DEFAULT_BODY_FONT_FAMILY, setFontFamilySelectValue } from '../config/font-families';
import { ProjectService } from '../services/ProjectService';
import { bindDrawerToggleButton, getDrawerToggleButtonState, readDrawerNumber, setDrawerToggleButtonState } from './components/drawerControls';
import { createSectionToggle, getSectionVisibilityNodes } from './components/SectionVisibilityDrawer';
import { onSettingsTabActivated } from './settings-drawer';

const tocLevels = [1, 2, 3, 4, 5, 6] as const;
type TocLevel = typeof tocLevels[number];
type TocLevelKey = `h${TocLevel}`;

const defaultTocStyle = (): TocStyle => ({
  fontFamily: DEFAULT_BODY_FONT_FAMILY,
  fontSize: 11,
  color: '#000000',
  isBold: false,
  isItalic: false,
  isAllCaps: false
});

const cloneTocStyle = (style?: TocStyle): TocStyle => ({
  fontFamily: style?.fontFamily || DEFAULT_BODY_FONT_FAMILY,
  fontSize: style?.fontSize ?? 11,
  color: style?.color || '#000000',
  isBold: !!style?.isBold,
  isItalic: !!style?.isItalic,
  isAllCaps: !!style?.isAllCaps
});

const cloneTocSetup = (toc?: TocSetup): TocSetup => toc ? {
  maxLevel: toc.maxLevel ?? 6,
  h1: cloneTocStyle(toc.h1),
  h2: cloneTocStyle(toc.h2),
  h3: cloneTocStyle(toc.h3),
  h4: cloneTocStyle(toc.h4),
  h5: cloneTocStyle(toc.h5),
  h6: cloneTocStyle(toc.h6)
} : {
  maxLevel: 6,
  h1: defaultTocStyle(),
  h2: defaultTocStyle(),
  h3: defaultTocStyle(),
  h4: defaultTocStyle(),
  h5: defaultTocStyle(),
  h6: defaultTocStyle()
};

const isTocLevel = (value: number): value is TocLevel => tocLevels.includes(value as TocLevel);
const getTocLevel = (value: number): TocLevel => (isTocLevel(value) ? value : 1);
const getLevelKey = (level: TocLevel): TocLevelKey => `h${level}` as TocLevelKey;

export function initTocSetupDrawer(onSaveSetup: (setup: PageSetup) => Promise<void>) {
  const applyButton = document.getElementById('btn-apply-toc-setup')!;
  const maxLevelSelect = document.getElementById('toc-max-level') as HTMLSelectElement;
  const headingLevelSelect = document.getElementById('toc-heading-level') as HTMLSelectElement;
  const fontSelect = document.getElementById('toc-selected-font') as HTMLSelectElement;
  const sizeInput = document.getElementById('toc-selected-size') as HTMLSelectElement;
  const colorInput = document.getElementById('toc-selected-color') as HTMLInputElement;
  const boldButton = document.getElementById('toc-selected-bold') as HTMLButtonElement;
  const italicButton = document.getElementById('toc-selected-italic') as HTMLButtonElement;
  const allCapsInput = document.getElementById('toc-selected-all-caps') as HTMLInputElement;
  const sectionSelect = document.getElementById('toc-section-select') as HTMLSelectElement;
  const sectionList = document.getElementById('toc-section-list')!;

  let workingSetup = cloneTocSetup(state.current.pageSetup.toc);
  let activeLevel: TocLevel = 1;
  let selectedSectionPath: string | null = null;

  const readSelectedLevelStyle = (): TocStyle => ({
    fontFamily: fontSelect.value,
    fontSize: readDrawerNumber(sizeInput, 11, { integer: true, min: 1, max: 200 }),
    color: colorInput.value,
    isBold: getDrawerToggleButtonState(boldButton),
    isItalic: getDrawerToggleButtonState(italicButton),
    isAllCaps: allCapsInput.checked
  });

  const storeActiveLevelStyle = () => {
    workingSetup[getLevelKey(activeLevel)] = readSelectedLevelStyle();
  };

  const syncSelectedLevelInputs = () => {
    const style = workingSetup[getLevelKey(activeLevel)];
    setFontFamilySelectValue(fontSelect, style.fontFamily, DEFAULT_BODY_FONT_FAMILY);
    sizeInput.value = String(style.fontSize ?? 11);
    colorInput.value = style.color || '#000000';
    setDrawerToggleButtonState(boldButton, !!style.isBold);
    setDrawerToggleButtonState(italicButton, !!style.isItalic);
    allCapsInput.checked = !!style.isAllCaps;
  };

  const syncCurrentToWorkingSetup = () => {
    storeActiveLevelStyle();
  };

  const syncMaxLevelToWorkingSetup = () => {
    workingSetup.maxLevel = readDrawerNumber(maxLevelSelect, workingSetup.maxLevel ?? 6, {
      integer: true,
      min: 1,
      max: 6
    });
  };

  maxLevelSelect.value = String(state.current.pageSetup.toc?.maxLevel ?? 6);
  activeLevel = getTocLevel(Number.parseInt(headingLevelSelect.value, 10));
  syncSelectedLevelInputs();

  const updateActiveLevel = (nextLevel: TocLevel) => {
    if (nextLevel === activeLevel) return;
    syncCurrentToWorkingSetup();
    activeLevel = nextLevel;
    headingLevelSelect.value = String(activeLevel);
    syncSelectedLevelInputs();
  };

  maxLevelSelect.addEventListener('change', syncMaxLevelToWorkingSetup);
  headingLevelSelect.addEventListener('change', () => updateActiveLevel(getTocLevel(Number.parseInt(headingLevelSelect.value, 10))));
  fontSelect.addEventListener('change', syncCurrentToWorkingSetup);
  sizeInput.addEventListener('input', syncCurrentToWorkingSetup);
  colorInput.addEventListener('input', syncCurrentToWorkingSetup);
  allCapsInput.addEventListener('change', syncCurrentToWorkingSetup);

  bindDrawerToggleButton(boldButton, syncCurrentToWorkingSetup);
  bindDrawerToggleButton(italicButton, syncCurrentToWorkingSetup);

  const syncInputs = () => {
    const toc = state.current.pageSetup.toc;
    maxLevelSelect.value = String(toc?.maxLevel ?? 6);
    workingSetup = cloneTocSetup(toc);
    activeLevel = getTocLevel(Number.parseInt(headingLevelSelect.value, 10));
    headingLevelSelect.value = String(activeLevel);
    syncSelectedLevelInputs();
  };

  const refreshSectionControls = () => {
    selectedSectionPath = syncTocSectionSelect(sectionSelect, selectedSectionPath);
    renderTocSectionControls(sectionList, selectedSectionPath);
  };

  const refreshOpenSectionControls = () => {
    const panel = document.querySelector<HTMLElement>('[data-settings-panel="toc"]');
    if (panel && !panel.classList.contains('hidden')) refreshSectionControls();
  };

  onSettingsTabActivated('toc', () => {
    syncInputs();
    refreshSectionControls();
  });

  sectionSelect.addEventListener('change', () => {
    selectedSectionPath = sectionSelect.value || null;
    renderTocSectionControls(sectionList, selectedSectionPath);
  });

  applyButton.addEventListener('click', async () => {
    storeActiveLevelStyle();
    const setup = { ...state.current.pageSetup, toc: workingSetup };
    state.setPageSetup(setup);
    await onSaveSetup(setup);
  });

  state.on(APP_STATE_EVENTS.projectSnapshotChanged, syncInputs);
  state.on(APP_STATE_EVENTS.settingsSnapshotChanged, syncInputs);
  state.on(APP_STATE_EVENTS.projectSnapshotChanged, refreshOpenSectionControls);
  state.on(APP_STATE_EVENTS.projectTreeChanged, refreshOpenSectionControls);
  state.on(APP_STATE_EVENTS.settingsSnapshotChanged, refreshOpenSectionControls);
  syncInputs();
}

function syncTocSectionSelect(select: HTMLSelectElement, preferredPath: string | null): string | null {
  const sections = state.current.sections;
  const nodes = getSectionVisibilityNodes(sections);

  select.innerHTML = '';

  if (nodes.length === 0) {
    select.disabled = true;
    return null;
  }

  const activeFile = state.current.activeFile;
  const selectedPath = (preferredPath && nodes.some(node => node.path === preferredPath))
    ? preferredPath
    : (activeFile && nodes.some(node => node.path === activeFile))
      ? activeFile
      : nodes[0].path;

  nodes.forEach(node => {
    const option = document.createElement('option');
    option.value = node.path;
    option.textContent = `${node.name} (${node.isDir ? 'Folder' : 'File'})`;
    select.appendChild(option);
  });

  select.disabled = false;
  select.value = selectedPath;
  return selectedPath;
}

function renderTocSectionControls(container: HTMLElement, selectedPath: string | null) {
  container.innerHTML = '';
  const sections = state.current.sections;
  const nodes = getSectionVisibilityNodes(sections);

  if (nodes.length === 0 || !selectedPath) {
    container.innerHTML = '<p class="drawer-note">No sections found.</p>';
    return;
  }

  const node = nodes.find(candidate => candidate.path === selectedPath);
  if (!node) {
    container.innerHTML = '<p class="drawer-note">Choose a section to configure.</p>';
    return;
  }

  const stateNode = sections.find(section => section.path === node.path) || { numberHeadings: false, includeInToc: false };

  const card = document.createElement('section');
  card.className = 'drawer-card section-visibility-card toc-section-card';

  const headerRow = document.createElement('div');
  headerRow.className = 'section-visibility-card-head';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'drawer-card-head section-visibility-card-title';
  const title = document.createElement('h5');
  title.textContent = node.name;
  const kind = document.createElement('span');
  kind.textContent = node.isDir ? 'Folder' : 'File';
  titleDiv.append(title, kind);
  headerRow.appendChild(titleDiv);
  card.appendChild(headerRow);

  const togglesRow = document.createElement('div');
  togglesRow.className = 'drawer-control-stack section-visibility-actions';

  const tocToggle = createSectionToggle('Include in TOC', !!stateNode.includeInToc, 'On', 'Off');
  const tocCb = tocToggle.input;
  tocCb.addEventListener('change', async () => {
    tocCb.disabled = true;
    const success = await ProjectService.toggleToc(node.path, tocCb.checked);
    if (!success) tocCb.checked = !tocCb.checked;
    tocCb.disabled = false;
  });

  const numberingToggle = createSectionToggle('Heading numbers', !!stateNode.numberHeadings, 'On', 'Off');
  const numberingCb = numberingToggle.input;
  numberingCb.addEventListener('change', async () => {
    numberingCb.disabled = true;
    const success = await ProjectService.toggleHeadingNumbering(node.path, numberingCb.checked);
    if (!success) numberingCb.checked = !numberingCb.checked;
    numberingCb.disabled = false;
  });

  togglesRow.append(tocToggle.element, numberingToggle.element);
  card.appendChild(togglesRow);
  container.appendChild(card);
}
