import '/src/style.css';
import { createEditor } from '/src/editor/createEditor.ts';
import { waitFor } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
  }
}

const image = '![Diagram](images/diagram.png){width=60% align=center}';
const initial = ['Intro.', image, 'Middle.', 'Destination.'].join('\n');
const expected = ['Intro.', 'Middle.', image, 'Destination.'].join('\n');

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: y,
    pointerId: 41,
    pointerType: 'mouse'
  });
}

function drag(type: string, x: number, y: number, dataTransfer: DataTransfer): DragEvent {
  return new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    dataTransfer
  });
}

async function run() {
  const parent = document.getElementById('editor');
  if (!parent) throw new Error('Editor root missing.');
  const editor = createEditor(parent, initial, {
    onChange: () => {},
    resolveImageSource: async () => 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="40"%3E%3Crect width="80" height="40" fill="%23d9eef0"/%3E%3C/svg%3E'
  });
  const widget = await waitFor('image preview widget', () => document.querySelector<HTMLElement>('[data-image-preview-drag-source="true"]'));
  const destinationPosition = initial.indexOf('Destination.');
  const sourceRect = widget.getBoundingClientRect();

  widget.dispatchEvent(pointer('pointerdown', sourceRect.left + 8, sourceRect.top + 8));
  await new Promise(resolve => setTimeout(resolve, 240));
  if (!widget.draggable) throw new Error('Image widget did not arm native dragging after the hold delay.');
  const targetCoords = editor.view.coordsAtPos(destinationPosition);
  if (!targetCoords) throw new Error('Updated destination coordinates unavailable.');
  const dataTransfer = new DataTransfer();
  widget.dispatchEvent(drag('dragstart', sourceRect.left + 8, sourceRect.top + 8, dataTransfer));
  const dragOver = drag('dragover', targetCoords.left, targetCoords.top + 1, dataTransfer);
  editor.view.contentDOM.dispatchEvent(dragOver);
  if (!dragOver.defaultPrevented) throw new Error('Image dragover did not enable a valid drop target.');
  // Mirrors browsers that show a cursor but reject `drop`: dragend must still
  // commit the direct Markdown cut-and-paste operation.
  widget.dispatchEvent(drag('dragend', targetCoords.left, targetCoords.top + 1, dataTransfer));

  await waitFor('image block moved', () => editor.getValue() === expected);
  window.__HARNESS_RESULT__ = { ok: true, moved: editor.getValue() === expected };
  editor.destroy();
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
