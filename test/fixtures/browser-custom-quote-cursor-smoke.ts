import '/src/style.css';
import { createEditor } from '/src/editor/createEditor.ts';
import { state } from '/src/state.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
  }
}

const quoteStyle = {
  id: 'cursor-quote',
  name: 'Cursor quote',
  prefix: '>>',
  icon: '',
  fontFamily: 'Georgia',
  fontSize: 12,
  color: '#334455',
  isBold: false,
  isItalic: true,
  lineHeight: 1.4,
  marginTop: 24,
  marginBottom: 18
};

const lowerPriorityOverlappingStyle = {
  ...quoteStyle,
  id: 'generic-quote',
  name: 'Generic quote',
  prefix: '>',
  marginTop: 120,
  marginBottom: 120
};

const initial = [
  'Alpha before the quote.',
  '>> A deliberately long custom quote line that wraps when the editor is narrowed and exercises measured line geometry.',
  'Beta after the quote.',
  '>> Adjacent quote one.',
  '>> Adjacent quote two.',
  'Omega after adjacent quotes.'
].join('\n');

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

async function settleGeometry(editor: ReturnType<typeof createEditor>) {
  editor.view.requestMeasure();
  await frame();
  await frame();
}

/**
 * Re-measuring after a resize or style change can take CodeMirror more than
 * two frames on a loaded machine, so poll until positions round-trip. A real
 * regression still fails once the deadline passes.
 */
async function roundTripsOnceSettled(
  editor: ReturnType<typeof createEditor>,
  positions: readonly number[],
  timeoutMs = 2_000
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  do {
    await settleGeometry(editor);
    if (roundTrips(editor, positions)) return true;
  } while (performance.now() < deadline);
  return false;
}

function roundTrips(editor: ReturnType<typeof createEditor>, positions: readonly number[]): boolean {
  return positions.every(position => {
    const coordinates = editor.view.coordsAtPos(position, 1);
    if (!coordinates) return false;
    return editor.view.posAtCoords({
      x: coordinates.left,
      y: (coordinates.top + coordinates.bottom) / 2
    }) === position;
  });
}

async function clickAtPosition(editor: ReturnType<typeof createEditor>, position: number): Promise<boolean> {
  const coordinates = editor.view.coordsAtPos(position, 1);
  if (!coordinates) return false;
  const x = coordinates.left;
  const y = (coordinates.top + coordinates.bottom) / 2;
  const target = document.elementFromPoint(x, y) ?? editor.view.contentDOM;
  target.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y, detail: 1
  }));
  target.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: x, clientY: y, detail: 1
  }));
  await frame();
  return editor.view.state.selection.main.head === position;
}

async function run() {
  const parent = document.getElementById('editor');
  if (!(parent instanceof HTMLElement)) throw new Error('Editor root missing.');
  parent.style.setProperty('--editor-font-size', '20px');
  state.setCustomBlockStyles([quoteStyle, lowerPriorityOverlappingStyle]);
  const editor = createEditor(parent, initial, { onChange: () => {} });
  await settleGeometry(editor);

  const quoteLines = Array.from(editor.view.contentDOM.querySelectorAll<HTMLElement>('.cm-custom-block-line'));
  if (quoteLines.length !== 3) throw new Error(`Expected 3 custom quote lines, found ${quoteLines.length}.`);
  const quoteComputed = getComputedStyle(quoteLines[0]);
  const inheritsEditorFontSize = quoteComputed.fontSize === '20px';
  const initialPaddingTop = parseFloat(quoteComputed.paddingTop);
  const usesMeasuredPadding = initialPaddingTop > 0;
  const hasNoBottomPadding = parseFloat(quoteComputed.paddingBottom) === 0;
  const avoidsUnmeasuredMargins = parseFloat(quoteComputed.marginTop) === 0
    && parseFloat(quoteComputed.marginBottom) === 0;
  // Both prefixes match, so this also verifies that one deterministic line
  // decoration is produced and the first configured style wins.
  const firstConfiguredStyleWins = initialPaddingTop < 60;

  const positions = [
    initial.indexOf('Alpha') + 3,
    initial.indexOf('deliberately') + 5,
    initial.indexOf('Beta') + 2,
    initial.indexOf('Adjacent quote one') + 9,
    initial.indexOf('Adjacent quote two') + 9,
    initial.indexOf('Omega') + 3
  ];
  const initialRoundTrips = roundTrips(editor, positions);
  const exactClick = await clickAtPosition(editor, positions[2]);

  parent.style.width = '260px';
  const wrappedRoundTrips = await roundTripsOnceSettled(editor, positions);

  state.setCustomBlockStyles([
    { ...quoteStyle, marginTop: 36, marginBottom: 30 },
    lowerPriorityOverlappingStyle
  ]);
  await settleGeometry(editor);
  const updatedQuote = editor.view.contentDOM.querySelector<HTMLElement>('.cm-custom-block-line');
  const updatedStyle = updatedQuote ? getComputedStyle(updatedQuote) : null;
  const liveStyleRemeasured = Boolean(updatedStyle)
    && parseFloat(updatedStyle!.paddingTop) > initialPaddingTop
    && await roundTripsOnceSettled(editor, positions);

  window.__HARNESS_RESULT__ = {
    ok: inheritsEditorFontSize && usesMeasuredPadding && hasNoBottomPadding && avoidsUnmeasuredMargins && firstConfiguredStyleWins && initialRoundTrips
      && exactClick && wrappedRoundTrips && liveStyleRemeasured,
    inheritsEditorFontSize,
    usesMeasuredPadding,
    hasNoBottomPadding,
    avoidsUnmeasuredMargins,
    firstConfiguredStyleWins,
    initialRoundTrips,
    exactClick,
    wrappedRoundTrips,
    liveStyleRemeasured
  };
  editor.destroy();
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error)
  };
});
