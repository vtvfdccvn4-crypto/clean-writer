import { createEditor } from '../../src/editor';
import {
  CORPUS_DOCUMENT,
  CORPUS_LONG_TASK_BUDGET_MS,
  CORPUS_P95_LATENCY_BUDGET_MS,
} from './corpus';

declare global {
  interface Window {
    __KEYBOARD_BENCH__?: {
      documentChars: number;
      focus(position: number): void;
      /** Resolves at the next animation frame, and returns the keystroke's latency in ms. */
      afterKeystroke(): Promise<number>;
      takeLongTasks(): number[];
      takeEventTimings(): number[];
    };
  }
}

const document1000 = CORPUS_DOCUMENT;
const parent = document.getElementById('editor');
if (!parent) throw new Error('Editor root missing.');
const editor = createEditor(parent, document1000, { onChange: () => undefined, onDirty: () => undefined });
const contentEditable = editor.view.contentDOM;

// The input event's timestamp is when the browser received the key. The animation
// callback of the frame that shows the edit runs before that frame is painted, so
// its time is an upper bound on input-to-paint, within about one paint.
let inputReceivedAt = 0;
contentEditable.addEventListener('beforeinput', event => {
  inputReceivedAt = event.timeStamp;
}, { capture: true });

const longTasks: number[] = [];
new PerformanceObserver(list => {
  for (const entry of list.getEntries()) longTasks.push(entry.duration);
}).observe({ type: 'longtask', buffered: false });

const eventTimings: number[] = [];
new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    if (entry.name === 'keydown' || entry.name === 'keypress' || entry.name === 'keyup' || entry.name === 'input') {
      eventTimings.push(entry.duration);
    }
  }
}).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);

window.__KEYBOARD_BENCH__ = {
  documentChars: document1000.length,
  focus(position: number) {
    editor.view.focus();
    editor.view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
  },
  afterKeystroke() {
    return new Promise<number>(resolve => {
      requestAnimationFrame(() => resolve(performance.now() - inputReceivedAt));
    });
  },
  takeLongTasks() {
    return longTasks.splice(0);
  },
  takeEventTimings() {
    return eventTimings.splice(0);
  }
};
