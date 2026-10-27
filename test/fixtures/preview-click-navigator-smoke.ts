import { PreviewClickNavigator } from '/src/preview/navigation/PreviewClickNavigator.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
  }
}

function targetFor(element: HTMLElement, line: number) {
  return {
    pageIndex: 0,
    element,
    entry: {
      range: { startLine: line, endLine: line },
      elementPath: [0],
      priority: 1
    }
  };
}

function run(): void {
  const stage = document.getElementById('preview-stage');
  if (!stage) throw new Error('Preview stage is missing.');

  const paragraph = document.createElement('p');
  const emphasis = document.createElement('em');
  emphasis.textContent = 'Source line twelve';
  paragraph.append(emphasis);

  const link = document.createElement('a');
  link.href = '#normal-link';
  link.textContent = 'Normal link';
  paragraph.append(' ', link);
  stage.append(paragraph);

  const resolvedLines: number[] = [];
  const navigator = new PreviewClickNavigator(stage, line => resolvedLines.push(line));
  navigator.setIndex({ getTargets: () => [targetFor(paragraph, 12)] });

  emphasis.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  window.__HARNESS_RESULT__ = {
    ok: true,
    resolvedLines,
    nestedClickResolved: resolvedLines.length === 1 && resolvedLines[0] === 12,
    linkWasIgnored: resolvedLines.length === 1
  };
  navigator.destroy();
}

try {
  run();
} catch (error) {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error)
  };
}
