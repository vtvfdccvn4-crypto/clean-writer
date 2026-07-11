import { OPFSCatalogue, OPFSWorkspaceRepository } from '/src/platform';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
  }
}

async function run() {
  const catalogue = new OPFSCatalogue();
  await catalogue.open();

  const repo1 = new OPFSWorkspaceRepository(catalogue);
  const ref = { id: `opfs-reopen-${Date.now().toString(36)}`, kind: 'opfs' as const, displayName: 'Reopen Smoke' };
  await catalogue.register(ref);
  const session1 = await repo1.open(ref);

  await session1.createSection('draft.md', '# Draft\nSaved in OPFS');
  await session1.mutateSettings({ type: 'append-order', path: 'draft.md' });
  await session1.mutateSettings({
    type: 'patch',
    values: {
      pageSetup: { marginTop: 42, marginLeft: 31 },
      typographySetup: { paragraph: { fontSize: 17, isBold: true, marginBottom: 9 } },
      projectMetadata: { documentTitle: 'OPFS Title', author: 'Ada' },
      customStyles: [{
        id: 'opfs-inline',
        name: 'OPFS Inline',
        openingPair: '{{',
        closingPair: '}}',
        fontFamily: 'Arial',
        fontSize: 12,
        color: '#123456',
        isBold: true,
        isItalic: false
      }],
      customBlockStyles: [{
        id: 'opfs-block',
        name: 'OPFS Block',
        prefix: '!!',
        icon: '',
        fontFamily: 'Arial',
        fontSize: 13,
        color: '#654321',
        isBold: true,
        isItalic: false,
        lineHeight: 1.4,
        marginTop: 7,
        marginBottom: 8
      }]
    }
  });

  const repo2 = new OPFSWorkspaceRepository(catalogue);
  const session2 = await repo2.open(ref);
  const reopenedContent = await session2.readSection('draft.md');
  const reopenedSettings = await session2.readSettings();
  const lastOpenedId = await catalogue.getLastOpenedId();

  const encoder = new TextEncoder();
  await session2.writeImage('images/test.png', encoder.encode('data'));
  const images = await session2.listImages();
  const imagePaths = images.map(i => i.path);

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind: session2.kind,
    reopenedContent,
    reopenedOrder: reopenedSettings.order,
    reopenedMarginTop: reopenedSettings.pageSetup.marginTop,
    reopenedMarginLeft: reopenedSettings.pageSetup.marginLeft,
    reopenedParagraphFontSize: reopenedSettings.typographySetup.paragraph.fontSize,
    reopenedParagraphBold: reopenedSettings.typographySetup.paragraph.isBold,
    reopenedDocumentTitle: reopenedSettings.projectMetadata.documentTitle,
    reopenedAuthor: reopenedSettings.projectMetadata.author,
    reopenedCustomStyleBold: reopenedSettings.customStyles[0]?.isBold,
    reopenedCustomBlockMarginTop: reopenedSettings.customBlockStyles[0]?.marginTop,
    lastOpenedId,
    refId: ref.id,
    imagePaths
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
