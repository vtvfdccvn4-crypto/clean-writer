import { LocalDirectoryWorkspaceSession } from '../../src/platform/LocalDirectoryWorkspace';

async function run() {
  try {
    const root = await navigator.storage.getDirectory();
    
    // Clean up from previous runs
    await root.removeEntry('test-local-dir', { recursive: true }).catch(() => {});
    
    const testDir = await root.getDirectoryHandle('test-local-dir', { create: true });

    // 1. Initialize session
    const session = new LocalDirectoryWorkspaceSession(
      'test-local-dir-id',
      'Test Local Dir',
      testDir
    );
    await session.initialize();

    // 2. Settings round-trip
    const preMutation = await session.readSettings();
    await session.mutateSettings({ type: 'append-order', path: 'sections/intro.md' });
    await session.mutateSettings({
      type: 'patch',
      values: {
        pageSetup: { marginTop: 44, marginRight: 33 },
        typographySetup: { paragraph: { fontSize: 16, isBold: true, marginBottom: 10 } },
        projectMetadata: { documentTitle: 'Local Directory Title', author: 'Grace' },
        customStyles: [{
          id: 'local-inline',
          name: 'Local Inline',
          openingPair: '[[',
          closingPair: ']]',
          fontFamily: 'Arial',
          fontSize: 12,
          color: '#123456',
          isBold: true,
          isItalic: false
        }],
        customBlockStyles: [{
          id: 'local-block',
          name: 'Local Block',
          prefix: '>>',
          icon: '',
          fontFamily: 'Arial',
          fontSize: 13,
          color: '#654321',
          isBold: true,
          isItalic: false,
          lineHeight: 1.5,
          marginTop: 6,
          marginBottom: 11
        }]
      }
    });
    const settings = await session.readSettings();
    if (settings.order.length === 0) {
      throw new Error(`Settings round-trip failed! preMutation: ${JSON.stringify(preMutation.order)}, settings: ${JSON.stringify(settings.order)}`);
    }

    // 3. Section CRUD
    await session.createSection('sections/intro.md', '# Hello\nWorld');
    const content = await session.readSection('sections/intro.md');

    // 4. Rename
    await session.renameSection('sections/intro.md', 'sections/chapter1.md');
    const renamed = await session.readSection('sections/chapter1.md');

    // 5. Persistence: create a second session from the same handle
    const session2 = new LocalDirectoryWorkspaceSession('test-local-dir-id', 'Test Local Dir', testDir);
    await session2.initialize();
    const settings2 = await session2.readSettings();
    const content2 = await session2.readSection('sections/chapter1.md');

    // 6. Image Write
    const encoder = new TextEncoder();
    await session2.writeImage('images/test-img.png', encoder.encode('fake-png-data'));
    const images = await session2.listImages();
    const imagePaths = images.map(i => i.path);

    // 7. Delete
    await session2.deleteSection('sections/chapter1.md');
    const sections = await session2.listSections();

    (window as any).__HARNESS_RESULT__ = {
      ok: true,
      sessionKind: session.kind,
      canPersistHandle: session.capabilities.canPersistHandle,
      settingsOrder: settings.order,
      settingsMarginTop: settings.pageSetup.marginTop,
      settingsMarginRight: settings.pageSetup.marginRight,
      settingsParagraphFontSize: settings.typographySetup.paragraph.fontSize,
      settingsParagraphBold: settings.typographySetup.paragraph.isBold,
      settingsDocumentTitle: settings.projectMetadata.documentTitle,
      settingsAuthor: settings.projectMetadata.author,
      settingsCustomStyleBold: settings.customStyles[0]?.isBold,
      settingsCustomBlockMarginBottom: settings.customBlockStyles[0]?.marginBottom,
      sectionContent: content,
      renamedContent: renamed,
      persistedOrder: settings2.order,
      persistedMarginTop: settings2.pageSetup.marginTop,
      persistedDocumentTitle: settings2.projectMetadata.documentTitle,
      persistedCustomStyleBold: settings2.customStyles[0]?.isBold,
      persistedContent: content2,
      sectionsAfterDelete: sections.length,
      imagePaths
    };
  } catch (error) {
    (window as any).__HARNESS_RESULT__ = {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

run();
