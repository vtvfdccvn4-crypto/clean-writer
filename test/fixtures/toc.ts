import { compileMarkdown } from '../../src/compiler';
import { buildFullDocumentMarkdown } from '../../src/preview/document-rendering';
import { applyHeadingNumbering } from '../../src/preview/headingNumbering';
import { applyTableOfContents } from '../../src/preview/tableOfContents';
import { tocSetupDrawerTemplate } from '../../src/ui/components/TocSetupDrawer';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

async function run() {
  const compiledDirective = await compileMarkdown('Before\n\n:::toc\n\nAfter');
  const directiveHost = document.createElement('div');
  directiveHost.innerHTML = compiledDirective;

  const stage = document.getElementById('stage')!;
  const sections = [
    { path: 'root.md', isDir: false, hideHeader: true, hideFooter: true, numberHeadings: true, includeInToc: true },
    { path: 'contents.md', isDir: false },
    { path: 'Folder', isDir: true, includeInToc: true },
    { path: 'Folder/chapter.md', isDir: false },
    { path: 'excluded.md', isDir: false },
    { path: 'appendix.md', isDir: false, includeInToc: true }
  ];
  const markdown = buildFullDocumentMarkdown(sections, [
    { path: 'root.md', markdown: '# Root chapter' },
    { path: 'contents.md', markdown: ':::toc\n\n# Contents page' },
    { path: 'Folder/chapter.md', markdown: '## Folder chapter' },
    { path: 'excluded.md', markdown: '# Excluded notes' },
    { path: 'appendix.md', markdown: '### Appendix' }
  ]);
  stage.innerHTML = await compileMarkdown(markdown);

  applyHeadingNumbering(stage);
  applyTableOfContents(stage, 2);
  const links = Array.from(stage.querySelectorAll<HTMLAnchorElement>('.toc-link'));
  const rootSection = stage.querySelector<HTMLElement>('[data-section-path="root.md"]');
  const settingsHost = document.createElement('div');
  settingsHost.innerHTML = tocSetupDrawerTemplate();

  window.__HARNESS_RESULT__ = {
    ok: true,
    directiveCompiled: directiveHost.querySelectorAll('.toc-placeholder').length === 1,
    placeholderReplaced: stage.querySelector('.toc-placeholder') === null,
    navCount: stage.querySelectorAll('.table-of-contents').length,
    labels: links.map(link => link.textContent),
    levels: links.map(link => link.parentElement?.className),
    leaderOrder: links.every(link =>
      link.children[0]?.classList.contains('toc-label')
      && link.children[1]?.classList.contains('toc-leader')
    ),
    targetsResolve: links.every(link => Boolean(stage.querySelector(link.hash))),
    headerHidden: rootSection?.dataset.hideHeader === 'true',
    footerHidden: rootSection?.dataset.hideFooter === 'true',
    numbered: rootSection?.querySelector('.heading-number')?.textContent === '1. ',
    tocControls: Boolean(settingsHost.querySelector('#toc-max-level'))
      && Boolean(settingsHost.querySelector('#toc-heading-level'))
      && ['font', 'size', 'color', 'bold', 'italic', 'all-caps'].every(control =>
        Boolean(settingsHost.querySelector(`#toc-selected-${control}`))
      ),
    headingLevelOptions: settingsHost.querySelectorAll('#toc-heading-level option').length === 6
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
