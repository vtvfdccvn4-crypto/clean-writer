import { state } from '../state';
import type { PageSetup, HeaderFooterRow, HeaderFooterCell } from '../state';
import {
  bindDrawerToggleButton,
  getDrawerToggleButtonState,
  readDrawerNumber,
  setDrawerToggleButtonState,
  resolveDrawerAlignmentPreset,
  resolveDrawerAlignmentValues
} from './components/drawerControls';
import { DEFAULT_HEADER_FOOTER_FONT_FAMILY, setFontFamilySelectValue } from '../config/font-families';
import { initSectionVisibilityControls } from './components/SectionVisibilityDrawer';
import { bindProjectSettingsPanel } from './project-settings-panel';
import { resolveHeaderFooterCell } from '../styles/resolved-document-styles';

type HeaderFooterCellKey = 'left' | 'center' | 'right';

const headerFooterCellKeys: HeaderFooterCellKey[] = ['left', 'center', 'right'];

const cloneCell = (cell: HeaderFooterCell): HeaderFooterCell => ({
  ...resolveHeaderFooterCell(cell),
  horizontalAlign: cell.horizontalAlign,
  verticalAlign: cell.verticalAlign
});

const cloneRow = (row: HeaderFooterRow): HeaderFooterRow => ({
  centerWidth: row.centerWidth || '100px',
  left: cloneCell(row.left),
  center: cloneCell(row.center),
  right: cloneCell(row.right)
});

const resolveCellKey = (value: string): HeaderFooterCellKey =>
  headerFooterCellKeys.includes(value as HeaderFooterCellKey) ? value as HeaderFooterCellKey : 'left';

let paperSizeSelect: HTMLSelectElement;
let marginTopInput: HTMLInputElement;
let marginBottomInput: HTMLInputElement;
let marginLeftInput: HTMLInputElement;
let marginRightInput: HTMLInputElement;
let showGuidelinesInput: HTMLInputElement;

export function initPageSetupDrawer(onSaveSetup: (setup: PageSetup) => Promise<void>) {
  const btnApplyPageSetup = document.getElementById('btn-apply-page-setup')!;
  
  paperSizeSelect = document.getElementById('paper-size') as HTMLSelectElement;
  marginTopInput = document.getElementById('margin-top') as HTMLInputElement;
  marginBottomInput = document.getElementById('margin-bottom') as HTMLInputElement;
  marginLeftInput = document.getElementById('margin-left') as HTMLInputElement;
  marginRightInput = document.getElementById('margin-right') as HTMLInputElement;
  showGuidelinesInput = document.getElementById('show-guidelines') as HTMLInputElement;

  const headerCellSelect = document.getElementById('header-cell-select') as HTMLSelectElement;
  const footerCellSelect = document.getElementById('footer-cell-select') as HTMLSelectElement;
  const refreshSectionVisibilityControls = initSectionVisibilityControls(
    document.getElementById('page-section-visibility-select') as HTMLSelectElement,
    document.getElementById('page-section-visibility-controls')!
  );
  let workingHeader = cloneRow(state.current.pageSetup.header);
  let workingFooter = cloneRow(state.current.pageSetup.footer);
  let activeHeaderCell: HeaderFooterCellKey = 'left';
  let activeFooterCell: HeaderFooterCellKey = 'left';

  state.onPageSetupChanged(syncInputs);
  bindProjectSettingsPanel(syncInputs, {
    tabId: 'page-setup',
    onTabActivated: refreshSectionVisibilityControls
  });

  const getCellConfig = (prefix: string): HeaderFooterCell => {
    return {
      content: (document.getElementById(`${prefix}-content`) as HTMLInputElement).value,
      fontFamily: (document.getElementById(`${prefix}-font`) as HTMLSelectElement).value,
      fontSize: readDrawerNumber(`${prefix}-size`, 9, { integer: true, min: 1, max: 200 }),
      color: (document.getElementById(`${prefix}-color`) as HTMLInputElement).value,
      isBold: getDrawerToggleButtonState(`${prefix}-bold`),
      isItalic: getDrawerToggleButtonState(`${prefix}-italic`),
      ...resolveDrawerAlignmentValues((document.getElementById(`${prefix}-alignment`) as HTMLSelectElement).value)
    };
  };

  const storeVisibleCell = (type: 'header' | 'footer') => {
    const selectedCell = type === 'header' ? activeHeaderCell : activeFooterCell;
    const workingRow = type === 'header' ? workingHeader : workingFooter;
    workingRow.centerWidth = (document.getElementById(`${type}-center-width`) as HTMLInputElement).value || '100px';
    workingRow[selectedCell] = getCellConfig(`${type}-selected`);
  };

  const cellPrefixes = ['header-selected', 'footer-selected'];
  cellPrefixes.forEach(prefix => {
    bindDrawerToggleButton(`${prefix}-bold`);
    bindDrawerToggleButton(`${prefix}-italic`);
  });
  btnApplyPageSetup.addEventListener('click', async () => {
    storeVisibleCell('header');
    storeVisibleCell('footer');
    const [pw, ph] = paperSizeSelect.value.split(',').map(Number);
    const setup: PageSetup = {
      paperWidth: pw,
      paperHeight: ph,
      marginTop: readDrawerNumber(marginTopInput, 25, { integer: true, min: 0, max: 200 }),
      marginBottom: readDrawerNumber(marginBottomInput, 25, { integer: true, min: 0, max: 200 }),
      marginLeft: readDrawerNumber(marginLeftInput, 20, { integer: true, min: 0, max: 200 }),
      marginRight: readDrawerNumber(marginRightInput, 20, { integer: true, min: 0, max: 200 }),
      header: cloneRow(workingHeader),
      footer: cloneRow(workingFooter),
      toc: state.current.pageSetup.toc,
      showGuidelines: showGuidelinesInput.checked
    };
    
    await onSaveSetup(setup);
  });

  function syncCellConfig(prefix: string, cell: HeaderFooterCell) {
    (document.getElementById(`${prefix}-content`) as HTMLInputElement).value = cell.content || '';
    setFontFamilySelectValue(
      document.getElementById(`${prefix}-font`) as HTMLSelectElement,
      cell.fontFamily,
      DEFAULT_HEADER_FOOTER_FONT_FAMILY
    );
    (document.getElementById(`${prefix}-size`) as HTMLSelectElement).value = String(cell.fontSize ?? 9);
    const colorInput = document.getElementById(`${prefix}-color`) as HTMLInputElement;
    colorInput.value = resolveHeaderFooterCell(cell).color;
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    setDrawerToggleButtonState(`${prefix}-bold`, !!cell.isBold);
    setDrawerToggleButtonState(`${prefix}-italic`, !!cell.isItalic);
    (document.getElementById(`${prefix}-alignment`) as HTMLSelectElement).value = resolveDrawerAlignmentPreset(
      cell.horizontalAlign,
      cell.verticalAlign
    );
  }

  function syncRowControls(type: 'header' | 'footer') {
    const activeCell = type === 'header' ? activeHeaderCell : activeFooterCell;
    const workingRow = type === 'header' ? workingHeader : workingFooter;
    const cellSelect = type === 'header' ? headerCellSelect : footerCellSelect;
    cellSelect.value = activeCell;
    (document.getElementById(`${type}-center-width`) as HTMLInputElement).value = workingRow.centerWidth || '100px';
    syncCellConfig(`${type}-selected`, workingRow[activeCell]);
  }

  headerCellSelect.addEventListener('change', () => {
    storeVisibleCell('header');
    activeHeaderCell = resolveCellKey(headerCellSelect.value);
    syncRowControls('header');
  });

  footerCellSelect.addEventListener('change', () => {
    storeVisibleCell('footer');
    activeFooterCell = resolveCellKey(footerCellSelect.value);
    syncRowControls('footer');
  });

  syncInputs();
  function syncInputs() {
    const setup = state.current.pageSetup;
    paperSizeSelect.value = `${setup.paperWidth},${setup.paperHeight}`;
    marginTopInput.value = String(setup.marginTop);
    marginBottomInput.value = String(setup.marginBottom);
    marginLeftInput.value = String(setup.marginLeft);
    marginRightInput.value = String(setup.marginRight);
    showGuidelinesInput.checked = !!setup.showGuidelines;

    workingHeader = cloneRow(setup.header);
    workingFooter = cloneRow(setup.footer);
    activeHeaderCell = resolveCellKey(headerCellSelect.value);
    activeFooterCell = resolveCellKey(footerCellSelect.value);
    syncRowControls('header');
    syncRowControls('footer');
  }
}
