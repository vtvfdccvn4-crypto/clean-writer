// The browser smoke fixtures: each is a page under test/fixtures that publishes window.__HARNESS_RESULT__,
// and a validate function that asserts its result. Both browser runners import this list:
// release-browser-smoke.mjs (Chromium, over DevTools) and release-playwright-smoke.mjs (any Playwright
// browser, including WebKit). Keep fixtures browser-neutral here; the runner decides how to drive them.

export const fixtures = [
  {
    // No flag is set. Safari compiles 400,000 to 700,000 characters in the worker by default, and keeps smaller and
    // larger documents on the page. Chromium keeps every compile on the page until its own gate passes.
    name: 'browser-compile-worker-default-smoke',
    path: '/test/fixtures/browser-compile-worker-default-smoke.html',
    validate(result) {
      expect(result.ok === true, `Compile worker default smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.jobsAfterSmall === 0, 'A 1,000-character document must compile on the page.');
      const safari = result.userAgent.includes('Safari') && !result.userAgent.includes('Chrome');
      if (safari) {
        expect(result.jobsAt550k >= 1, 'Safari must compile a 550,000-character document in the worker by default.');
        expect(result.jobsAt750k === result.jobsAt550k, 'Safari must keep a document above 700,000 characters on the page.');
      } else {
        expect(result.jobsAt550k === 0 && result.jobsAt750k === 0, 'Without the flag, a browser other than Safari must compile on the page.');
      }
    }
  },
  {
    // No stubs: the browser's own API surface decides the dialog. Safari must get browser storage only.
    name: 'browser-capability-detection-smoke',
    path: '/test/fixtures/browser-capability-detection-smoke.html',
    validate(result) {
      expect(result.ok === true, `Capability detection smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.localFolderShown === result.hasDirectoryPicker, 'The local-folder option must appear exactly when the browser has the File System Access API.');
      const safari = result.userAgent.includes('Safari') && !result.userAgent.includes('Chrome');
      if (safari) {
        expect(result.hasDirectoryPicker === false && result.localFolderShown === false, 'Safari must not offer a local-folder project.');
        expect(result.browserStorageShown === true && result.projectKind === 'opfs', 'Safari must get the browser-storage fallback.');
      }
    }
  },

  {
    name: 'browser-custom-quote-cursor-smoke',
    path: '/test/fixtures/browser-custom-quote-cursor-smoke.html',
    viewport: { width: 900, height: 700, deviceScaleFactor: 1 },
    validate(result) {
      expect(result.ok === true, 'Custom quote cursor geometry smoke reported failure.');
      expect(result.inheritsEditorFontSize === true, 'Custom quote lines did not inherit the configured editor font size.');
      expect(result.usesMeasuredPadding === true, 'Custom quote spacing was not included in measured line geometry.');
      expect(result.hasNoBottomPadding === true, 'Custom quote lines still have unwanted bottom padding.');
      expect(result.avoidsUnmeasuredMargins === true, 'A custom quote line still uses unsupported vertical margins.');
      expect(result.firstConfiguredStyleWins === true, 'Overlapping quote prefixes did not use deterministic configured order.');
      expect(result.initialRoundTrips === true && result.exactClick === true, 'Click coordinates did not resolve to exact source positions.');
      expect(result.wrappedRoundTrips === true, 'Wrapped custom quote lines corrupted cursor coordinates.');
      expect(result.liveStyleRemeasured === true, 'Live quote-style changes were not remeasured.');
    }
  },
  {
    name: 'preview-click-navigator-smoke',
    path: '/test/fixtures/preview-click-navigator-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Preview click navigation smoke reported failure.');
      expect(result.nestedClickResolved === true, 'A nested preview click did not resolve to its source line.');
      expect(result.linkWasIgnored === true, 'Preview navigation intercepted a normal link click.');
    }
  },
  {
    name: 'browser-image-block-drag-smoke',
    path: '/test/fixtures/browser-image-block-drag-smoke.html',
    validate(result) {
      expect(result.ok === true && result.moved === true, 'Long-press image block drag did not move the Markdown block.');
    }
  },
  {
    name: 'browser-editor-preview-resizer-smoke',
    path: '/test/fixtures/browser-editor-preview-resizer-smoke.html',
    viewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
    validate(result) {
      expect(result.ok === true, 'Editor/preview resizer smoke reported failure.');
      expect(result.separatorRole === 'separator' && result.separatorEnabled === true, 'Editor/preview separator is not accessible or enabled.');
      expect(result.editorGrewOnDrag === true && result.previewShrankOnDrag === true, 'Dragging the editor/preview separator did not resize both panes.');
      expect(result.keyboardResized === true, 'Keyboard resizing did not change the editor pane.');
      expect(result.resetRestoredBalance === true, 'Double-click did not restore an even split.');
      expect(result.persistedRatio === true, 'Editor/preview split ratio was not persisted.');
      expect(result.previewScalePausedDuringDrag === true, 'Preview scale updated during separator dragging.');
      expect(result.previewScaleSettledAfterDrag === true, 'Preview scale did not update after separator dragging ended.');
    }
  },
  {
    name: 'browser-table-helper-smoke',
    path: '/test/fixtures/browser-table-helper-smoke.html',
    validate(result) {
      expect(result.ok === true, 'The table grid did not render over a Markdown table.');
      expect(result.renderedInEditor === true, 'The table grid rendered outside the editor content.');
      expect(result.pipesHidden === true, 'The Markdown pipe source is still on screen behind the grid.');
      expect(result.sourceIntact === true, 'Rendering the grid changed the underlying Markdown.');
      expect(result.headerCells === 2 && result.bodyCells === 2, 'The grid did not render one cell per column and row.');
      expect(result.readsContent === true, 'Grid cells did not show the table content.');
      expect(result.chromeHiddenAtRest === true, 'The table controls are visible at rest instead of only on hover or focus.');
      expect(result.chromeShownOnFocus === true, 'Putting the caret in a cell did not reveal the table controls.');
      expect(result.headerHeightUnchanged === true, 'Revealing the controls changed the heading row height.');
      expect(result.alignToggles === 2, 'Each column did not get exactly one alignment toggle.');
      expect(result.headingsShareOneRow === true, 'The column headings are stacked instead of sharing one row.');
      expect(result.headingsSitOverTheirColumns === true, 'A column heading is not aligned with its own body column.');
      expect(result.alignmentShown === true, 'The alignment toggle did not report the column\'s current alignment.');
      expect(result.paneDidNotWiden === true, 'A table wider than the pane widened the editor instead of scrolling inside its box.');
      expect(result.tableScrollsInItsBox === true, 'A table wider than the pane did not scroll inside the widget.');
      expect(result.editKeptOtherCells === true, 'Editing one cell disturbed the others.');
      expect(result.tabMovedCaret === true, 'Tab did not carry the caret into the next cell.');
      expect(result.sourceShown === true, 'Edit as Markdown did not reveal the pipe source.');
      expect(result.pipesVisible === true, 'The revealed Markdown was not visible in the editor.');
      expect(result.gridRestored === true, 'Switching back from Markdown did not restore the grid.');
      expect(result.insertedColumns === true, 'The Table insert command did not build a three column starter table.');
      expect(result.insertedRows === 4, 'The inserted table did not have a header, delimiter and two body rows.');
      expect(result.keptExistingProse === true, 'The Table insert command discarded existing text.');
      expect(result.insertedGrid === true, 'An inserted table did not get its own grid.');
      expect(result.preservedSurroundingText === true, 'Helper edits disturbed text around the table.');
    }
  },
  {
    name: 'browser-current-dnd-smoke',
    path: '/test/fixtures/browser-current-dnd-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Current drag-and-drop smoke reported failure.');
      expect(result.sourcePreservedAfterReorder === true, 'Reordering removed the original section.');
      expect(result.relocatedPathPresent === true, 'Relocation did not create the destination section.');
      expect(result.oldPathRemovedAfterRelocation === true, 'Relocation left the original path behind.');
    }
  },
  {
    name: 'browser-project-opening-smoke',
    path: '/test/fixtures/browser-project-opening-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Project opening smoke reported failure.');
      expect(result.projectRemainedOpen === true, 'The first-run project closed after opening.');
      expect(result.workspaceRemainedVisible === true, 'The workspace was hidden after the first-run project opened.');
      expect(result.welcomeRemainedHidden === true, 'The welcome screen covered the first-run project after opening.');
    }
  },
  {
    name: 'browser-preview-first-block-navigation-smoke',
    path: '/test/fixtures/browser-preview-first-block-navigation-smoke.html',
    validate(result) {
      expect(result.ok === true, 'First-block preview navigation smoke reported failure.');
      expect(result.h1 === true, 'The first H1 did not navigate back to source.');
      expect(result.h2 === true, 'The first H2 did not navigate back to source.');
      expect(result.firstParagraph === true, 'The first paragraph did not navigate back to source.');
    }
  },
  {
    name: 'step10-browser-smoke',
    path: '/test/fixtures/step10-browser-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Step 10 browser smoke reported failure.');
      expect(result.projectKind === 'opfs', `Expected Step 10 OPFS project, got ${result.projectKind}.`);
      expect(result.templateCount === 5, 'Step 10 template creation coverage was incomplete.');
      expect(result.toolbarEdited === true, 'Step 10 Markdown toolbar did not edit selected text.');
      expect(result.pdfPreviewAvailable === true, 'Step 10 PDF preview entry point is unavailable.');
      expect(typeof result.reviewCount === 'number' && result.reviewCount >= 4, 'Step 10 review drawer did not report expected structural findings.');
      expect(Array.isArray(result.reviewKinds) && result.reviewKinds.includes('Duplicate heading') && result.reviewKinds.includes('Empty section') && result.reviewKinds.includes('Very long section'), 'Step 10 review checks were incomplete.');
      expect(result.outlineShortcut === true && result.searchShortcut === true, 'Step 10 drawer shortcuts did not open their targets.');
    }
  },
  {
    name: 'release-browser-smoke',
    path: '/test/fixtures/release-browser-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Release browser smoke reported failure.');
      expect(result.projectKind === 'opfs', 'Release browser smoke did not create an OPFS project.');
      expect(result.pdfPreviewButtonDisabled === false, 'PDF preview should be available.');
      expect(
        result.pdfPreviewLabel === 'PDF preview',
        'PDF preview button did not expose the PDF preview action.'
      );
      expect(result.manifestPresent === true, 'Release manifest was not linked in the web shell.');
    }
  },
  {
    name: 'browser-authoring-smoke',
    path: '/test/fixtures/browser-authoring-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser authoring smoke reported failure.');
      expect(result.projectKind === 'opfs', `Expected OPFS project kind, got ${result.projectKind}.`);
      if (typeof result.initialPageCount === 'number') {
        expect(result.initialPageCount > 0, 'Full-document preview did not render.');
        expect(result.pageSetupUsedIsolatedPipeline === true, 'Page setup did not trigger an isolated preview rerender.');
        expect(result.finalPreviewStayedPaginated === true, 'Editing silently switched the final preview to continuous mode.');
        expect(result.customHeaderUpdated === true, 'Custom header changes did not reach the installed preview.');
        expect(result.sourceNavigationAvailable === true, 'Preview source navigation target was unavailable.');
        expect(result.previewCleanAfterClose === true, 'Preview resources were not cleaned after project close.');
        return;
      }
      expect(result.projectNameShown === 'Authoring Smoke', `Expected project name to show Authoring Smoke, got ${result.projectNameShown}.`);
      expect(result.projectNameAfterClose === 'No project open', `Expected closed project label, got ${result.projectNameAfterClose}.`);
      expect(result.reopenedProjectName === 'Authoring Smoke', `Expected reopened project name to match, got ${result.reopenedProjectName}.`);
      expect(Array.isArray(result.alerts) && result.alerts.length === 0, 'Browser authoring smoke triggered unexpected alerts.');
      expect(result.viewStateRestored === true, 'Editor selection/view state was not restored.');
      expect(result.searchPanelOpened === true, 'Search panel did not open from the toolbar action.');
      expect(result.recoveryConfirmShown === true, 'Draft recovery confirmation was not shown.');
      expect(result.draftRestored === true, 'Draft recovery did not restore the draft content.');
      expect(result.fileDropNoticeSeen === true, 'Unsupported file drop notice was not shown.');
      expect(result.longTextAutosaved === true, 'Long-text save flow did not return to Saved state.');
      expect(result.longTextPreserved === true, 'Long-text content was not preserved after switching away and back.');
      expect(result.longTextCursorRestored === true, 'Long-text cursor position was not restored.');
      expect(result.pageSetupDraftDiscarded === true, 'Page setup draft values were not discarded on close.');
      expect(result.pageSetupApplyPersisted === true, 'Page setup changes did not persist on apply.');
      expect(result.deleteConfirmShownOnCancel === true, 'Delete confirmation did not show before cancel.');
      expect(result.deleteCancelPreservedSection === true, 'Section delete cancel did not preserve the section.');
      expect(result.deleteConfirmShownOnConfirm === true, 'Delete confirmation did not show before confirm.');
      expect(result.deleteConfirmedRemovedSection === true, 'Section delete confirm did not remove the section.');
      expect(Array.isArray(result.outlineSections) && result.outlineSections.length >= 2, 'Document outline did not render section headers.');
      expect(Array.isArray(result.outlineHeadings) && result.outlineHeadings.includes('Sub 1') && result.outlineHeadings.includes('Sub 2'), 'Document outline did not render expected markdown headings.');
      expect(result.outlineNavigationSuccessful === true, 'Document outline heading click did not navigate to the correct section.');
      expect(result.outlineCrossDocumentFocusAtTop === true, 'Cross-document outline navigation did not position the heading at the editor top.');
      expect(result.outlineSameDocumentNavigationAvoidedReload === true, 'Same-document outline navigation reloaded the editor.');
      expect(result.outlineRenamedSectionPresent === true, 'Document outline was not rebuilt correctly after a section rename.');
      expect(result.outlineProjectStatsRefreshedAfterSave === true, 'Document outline project totals did not refresh after a save.');
      expect(typeof result.outlineSectionStats === 'string' && result.outlineSectionStats.includes('words'), `Expected section stats readout, got: ${result.outlineSectionStats}`);
      expect(typeof result.outlineProjectStats === 'string' && result.outlineProjectStats.includes('Project Totals:'), `Expected project stats summary, got: ${result.outlineProjectStats}`);
      expect(result.searchResultCount >= 2, `Expected multiple project search results, got ${result.searchResultCount}.`);
      expect(result.searchDeletedResultCleared === true, 'Deleted project search results were not cleared from the drawer.');
      expect(result.searchNavigationSuccessful === true, 'Project-wide search did not navigate to the correct section.');
    }
  },
  {
    name: 'browser-sidebar-interactions-smoke',
    path: '/test/fixtures/browser-sidebar-interactions-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser sidebar interaction smoke reported failure.');
      expect(result.savedOnSwitch === true, 'Switching sections did not save the active document.');
      expect(result.pageBreakEnabled === true, 'Section page-break action did not persist.');
      expect(result.movedIntoFolder === true, 'Dragging a section into a folder did not move it.');
      expect(result.folderCollapsed === true && result.folderExpanded === true, 'Folder toggle did not collapse and re-expand the folder.');
    }
  },
  {
    name: 'browser-authoring-performance-smoke',
    path: '/test/fixtures/browser-authoring-performance-smoke.html',
    validate: (result) => {
      console.log(`[Perf] Outline render: ${result.outlineRenderMs?.toFixed(1)}ms`);
      console.log(`[Perf] Search execution: ${result.searchExecutionMs?.toFixed(1)}ms`);
      console.log(`[Perf] Search navigation: ${result.searchNavigationMs?.toFixed(1)}ms`);
      console.log(`[Perf] Full-document preview: ${result.previewTiming?.totalDurationMs?.toFixed(1)}ms`);
      
      expect(typeof result.outlineRenderMs === 'number' && result.outlineRenderMs < 3000, `Outline took too long to build: ${result.outlineRenderMs}ms (limit: 3000ms)`);
      expect(typeof result.searchExecutionMs === 'number' && result.searchExecutionMs < 3000, `Search execution took too long: ${result.searchExecutionMs}ms (limit: 3000ms)`);
      expect(typeof result.searchNavigationMs === 'number' && result.searchNavigationMs < 3000, `Search navigation took too long: ${result.searchNavigationMs}ms (limit: 3000ms)`);
      expect(result.editorInputReady === true, 'Editor was not ready for input after search navigation.');
      expect(result.repeatedInteractionsStable === true, 'Repeated interactions caused a crash or hang.');
      expect(result.previewTiming?.status === 'success', 'Full-document preview timing did not report success.');
      expect(typeof result.previewTiming?.totalDurationMs === 'number', 'Full-document preview timing has no total duration.');
      expect(Array.isArray(result.previewTiming?.phases), 'Full-document preview timing has no phase list.');
    }
  },
  {
    name: 'browser-opfs-persistence-smoke',
    path: '/test/fixtures/browser-opfs-persistence-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser OPFS persistence smoke reported failure.');
      expect(result.projectKind === 'opfs', `Expected OPFS project kind, got ${result.projectKind}.`);
      expect(result.recoveryPromptShown === false, 'A stale draft should not reopen with a recovery prompt after a successful save.');
      expect(result.reopenedText === 'Saved durable text', `Expected reopened text to match saved content, got ${result.reopenedText}.`);
      expect(result.savedDraftAbsent === true, 'A recovery draft remained after the section was saved.');
    }
  },
  {
    name: 'browser-responsive-shell-laptop-smoke',
    path: '/test/fixtures/browser-responsive-shell-smoke.html?mode=laptop',
    viewport: { width: 1024, height: 768, deviceScaleFactor: 1 },
    validate(result) {
      expect(result.ok === true, 'Responsive laptop smoke reported failure.');
      expect(result.viewport.width === 1024, `Expected 1024px laptop viewport, got ${result.viewport.width}.`);
      expect(result.editorRightOfExplorer === true, 'Editor should remain to the right of explorer on laptop-sized widths.');
      expect(result.previewRightOfEditor === true, 'Preview should remain to the right of the editor in the laptop split layout.');
      expect(result.editorPreviewDoNotOverlap === true, 'Editor and preview should not overlap in the laptop layout.');
      expect(result.modalWidth <= 1008, `Responsive modal width overflowed the laptop viewport (${result.modalWidth}).`);
    }
  },
  {
    name: 'browser-responsive-shell-tablet-smoke',
    path: '/test/fixtures/browser-responsive-shell-smoke.html?mode=tablet',
    viewport: { width: 820, height: 1180, deviceScaleFactor: 1 },
    validate(result) {
      expect(result.ok === true, 'Responsive tablet smoke reported failure.');
      expect(result.viewport.width === 820, `Expected 820px tablet viewport, got ${result.viewport.width}.`);
      expect(result.editorRightOfExplorer === true, 'Editor should remain to the right of explorer on tablet portrait widths.');
      expect(result.previewRightOfEditor === true, 'Preview should remain to the right of the editor on tablet portrait widths.');
      expect(result.editorPreviewDoNotOverlap === true, 'Editor and preview should not overlap on tablet portrait widths.');
      expect(result.modalWidth <= 804, `Responsive modal width overflowed the tablet viewport (${result.modalWidth}).`);
    }
  },
  {
    name: 'browser-recovery-smoke',
    path: '/test/fixtures/browser-recovery-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser recovery smoke reported failure.');
      expect(result.projectKind === 'directory', `Expected directory project after recovery, got ${result.projectKind}.`);
      expect(result.confirmTitle === 'Settings Recovery', `Expected settings recovery dialog, got ${result.confirmTitle}.`);
      expect(
        typeof result.confirmMessage === 'string' && result.confirmMessage.includes('malformed JSON'),
        'Recovery prompt did not explain the broken settings file.'
      );
      expect(
        typeof result.confirmMessage === 'string' && result.confirmMessage.includes('keep a backup'),
        'Recovery prompt did not explain the backup behavior.'
      );
      expect(
        typeof result.recoveryNotice === 'string' && result.recoveryNotice.includes('Project settings were recovered successfully.'),
        'Recovery success notice was not shown.'
      );
      expect(Array.isArray(result.backupFiles) && result.backupFiles.length >= 1, 'Recovery did not create a settings backup file.');
      expect(result.repairedSettingsLooksValid === true, 'Recovered settings.json was not rewritten to a valid settings object.');
    }
  },
  {
    name: 'browser-local-directory-reopen-smoke',
    path: '/test/fixtures/browser-local-directory-reopen-smoke.html',
    validate(result) {
      expect(result.ok === true, 'Browser local-directory reopen smoke reported failure.');
      expect(result.projectKind === 'directory', `Expected directory project kind, got ${result.projectKind}.`);
      expect(result.projectId === result.initialProjectId, 'Recent local-directory reopen did not restore the same workspace id.');
      expect(Array.isArray(result.sectionPaths) && result.sectionPaths.includes('sections/FolderSaved.md'), 'Recent local-directory reopen lost the saved section.');
      expect(typeof result.templateContent === 'string' && result.templateContent.includes('# Chapter'), 'Local-directory template content was not preserved.');
      expect(result.pickerCalls === 1, `Expected reopen-from-recents to avoid a second picker prompt, got ${result.pickerCalls} picker calls.`);
    }
  },
  {
    name: 'pagination-lifecycle-smoke',
    path: '/test/fixtures/pagination-lifecycle-smoke.html',
    validate(result) {
      expect(result.ok === true, `Pagination lifecycle smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.repeatedRunsStable === true, `Repeated pagination grew the Paged.js CSS: ${JSON.stringify(result.repeatedCssSizes)}.`);
      expect(result.smallCssHasOwnSize === true, 'A page-size run did not contain its own page rule.');
      expect(result.largeCssInheritsSmallSize === false, 'A later page-size run inherited the previous page rule.');
      expect(result.cancelWasMidRun === true, `The cancel did not land during pagination (status ${result.cancelStatus}).`);
      expect(result.cancelDiscardedFrame === true, 'A cancelled pagination job left its frame running.');
      expect(result.recoveredClean === true, 'The job after a cancel was not clean.');
      expect(result.burstAllTerminal === true, 'A rapid burst of pagination requests did not all succeed.');
      expect(result.orphanedFrames === 0, `Frames remained after the lifecycle run: ${result.orphanedFrames}.`);
    }
  },
  {
    name: 'pagination-watchdog-smoke',
    path: '/test/fixtures/pagination-watchdog-smoke.html',
    validate(result) {
      expect(result.ok === true, `Pagination watchdog smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.stallStatus === 'timed-out' && result.stallMessage.includes('stalled'), `A job without page progress was not stopped as a stall (status ${result.stallStatus}).`);
      expect(result.stallDiscardedFrame === true, 'A stalled pagination job left its frame running.');
      expect(result.ceilingStatus === 'timed-out' && result.ceilingMessage.includes('ceiling'), `A job past its ceiling was not stopped (status ${result.ceilingStatus}).`);
      expect(result.progressStatus === 'success', `A job still making progress was stopped (status ${result.progressStatus}).`);
      expect(result.outlivedStallLimit === true, `The progress job finished in ${result.progressElapsedMs}ms, which does not prove it outlived the stall limit.`);
      expect(result.orphanedFrames === 0, `Frames remained after the watchdog run: ${result.orphanedFrames}.`);
    }
  },
  {
    name: 'browser-draft-store-smoke',
    path: '/test/fixtures/browser-draft-store-smoke.html',
    validate(result) {
      expect(result.ok === true, `Draft store smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.survivedReload === true, 'A written draft did not survive a page reload in IndexedDB.');
      expect(result.damageDetected === true, 'A tampered draft was not reported as damaged.');
      expect(result.newerIgnored === true, 'A draft from a newer schema was returned to this build.');
      expect(result.discarded === true, 'A save with the draft text did not remove the draft.');
    }
  },
  {
    // Measurement, not a gate: run on demand with CLEAR_WRITER_SMOKE_FIXTURE=frame-isolation-bench
    // and CLEAR_WRITER_SMOKE_QUERY="variant=same-origin|sandboxed|cross-site".
    name: 'frame-isolation-bench',
    path: '/test/fixtures/frame-isolation-bench.html',
    validate(result) {
      expect(result.ok === true, `Frame isolation benchmark failed: ${JSON.stringify(result)}`);
    }
  },
  {
    // Measurement, not a gate: run on demand with CLEAR_WRITER_SMOKE_FIXTURE=preview-containment-bench
    // and CLEAR_WRITER_SMOKE_QUERY="contain=on" (or unset) to compare the two variants.
    name: 'preview-containment-bench',
    path: '/test/fixtures/preview-containment-bench.html',
    validate(result) {
      expect(result.ok === true, `Preview containment benchmark failed: ${JSON.stringify(result)}`);
    }
  },
  {
    // Measurement, not a gate: run on demand with CLEAR_WRITER_SMOKE_FIXTURE=editor-typing-bench.
    name: 'editor-typing-bench',
    path: '/test/fixtures/editor-typing-bench.html',
    validate(result) {
      expect(result.ok === true, `Editor typing benchmark failed: ${JSON.stringify(result)}`);
    }
  },
  {
    name: 'editor-viewport-highlight-smoke',
    path: '/test/fixtures/editor-viewport-highlight-smoke.html',
    validate(result) {
      expect(result.ok === true, `Viewport highlight smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.initiallyStyledFar === false, 'A style pair outside the viewport was highlighted before it was visible.');
      expect(result.styledAfterScroll === true, 'A style pair was not highlighted after it scrolled into view.');
      expect(result.typedStyled === true, 'A newly typed style pair was not highlighted.');
      expect(result.unclosedStyled === false, 'An unclosed style pair was highlighted.');
    }
  },
  {
    name: 'browser-preview-freshness-smoke',
    path: '/test/fixtures/browser-preview-freshness-smoke.html',
    validate(result) {
      expect(result.ok === true, `Preview freshness smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.previewLatencyMs < 700, `Live preview showed a typed edit after ${result.previewLatencyMs}ms, which waits for the autosave.`);
    }
  },
  {
    name: 'browser-external-change-smoke',
    path: '/test/fixtures/browser-external-change-smoke.html',
    validate(result) {
      expect(result.ok === true, `External change smoke reported failure: ${JSON.stringify(result)}`);
    }
  },
  {
    name: 'browser-preview-navigation-smoke',
    path: '/test/fixtures/browser-preview-navigation-smoke.html',
    validate(result) {
      expect(result.ok === true, `Preview navigation smoke reported failure: ${JSON.stringify(result)}`);
    }
  },
  {
    // Measurement, not a gate: run on demand with CLEAR_WRITER_SMOKE_FIXTURE=live-large-section-bench.
    name: 'live-large-section-bench',
    path: '/test/fixtures/live-large-section-bench.html',
    validate(result) {
      expect(result.ok === true, `Live large-section benchmark failed: ${JSON.stringify(result)}`);
    }
  },
  {
    name: 'browser-large-document-smoke',
    path: '/test/fixtures/browser-large-document-smoke.html',
    validate(result) {
      expect(result.ok === true, `Large document smoke reported failure: ${JSON.stringify(result)}`);
    }
  },
  {
    name: 'browser-storage-status-smoke',
    path: '/test/fixtures/browser-storage-status-smoke.html',
    validate(result) {
      expect(result.ok === true, `Storage status smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.supported === true, 'The browser did not expose navigator.storage.');
      expect(result.quotaBytes > 0, 'The browser did not report a storage quota.');
      expect(result.meterHidden === false, 'The usage meter stayed hidden although usage is known.');
      expect(result.quotaWarningShown === true, 'A storage use of 90% did not produce a warning notice.');
      expect(result.quotaWarningRepeatSuppressed === true, 'The same storage warning repeated instead of showing once.');
    }
  },
  {
    name: 'browser-pdf-job-status-smoke',
    path: '/test/fixtures/browser-pdf-job-status-smoke.html',
    validate(result) {
      expect(result.ok === true, `PDF job status smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.startedIndeterminate === true, 'The progress bar was determinate before any page was known.');
      expect(result.milestone25 === true && result.milestone50 === true, 'Page milestones were not announced.');
      expect(result.noAnnouncementBetween === true, 'Pages between milestones were announced, which floods screen readers.');
      expect(result.focusable === true, 'The Cancel control is not a focusable button.');
      expect(result.cancelledOnce === true, 'A Cancel press reached an earlier export\'s handler instead of only the current one.');
      expect(result.hiddenAfterCancel === true, 'The strip did not hide or announce the cancellation.');
    }
  },
  {
    name: 'browser-pdf-export-progress-smoke',
    path: '/test/fixtures/browser-pdf-export-progress-smoke.html',
    validate(result) {
      expect(result.ok === true, `PDF export progress smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.hiddenAfterCancel === true, 'The export progress strip stayed visible after Cancel.');
      expect(result.buttonRestored === true, 'The PDF preview button stayed disabled after Cancel.');
    }
  },
  {
    name: 'browser-outline-view-smoke',
    path: '/test/fixtures/browser-outline-view-smoke.html',
    validate(result) {
      expect(result.ok === true, `Outline view smoke reported failure: ${JSON.stringify(result)}`);
      expect(result.buttons === true && result.oneTabStop === true, 'Outline items are not buttons with a single tab stop.');
      expect(result.movedDown === true && result.movedUp === true && result.endIsLast === true && result.homeIsFirst === true, 'Arrow, Home and End keys do not move between outline items.');
      expect(result.activatedHeading === true && result.activatedSection === true, 'Activating an outline item did not report its section or heading.');
      expect(result.sameNodes === true && result.alphaNodeKept === true, 'An unchanged outline section was rebuilt on save.');
      expect(result.focusKept === true, 'Focus left the outline item when its section was re-rendered.');
      expect(result.scrollKept === true, 'The outline scroll position was lost on re-render.');
      expect(result.positionKept === true, 'Focus did not follow its heading when that heading moved to another line.');
    }
  },
  {
    name: 'pdf-visual',
    path: '/test/fixtures/pdf-visual.html',
    validate(result) {
      expect(result.ok === true, 'PDF visual fixture reported failure.');
      expect(result.pageCount === 2, `Expected 2 pages in PDF visual smoke, got ${result.pageCount}.`);
      expect(result.glyphPage === 1, `Expected glyph anchor on page 1, got ${result.glyphPage}.`);
      expect(result.forcedBreakPage === 2, `Expected forced page-break anchor on page 2, got ${result.forcedBreakPage}.`);
      expect(result.headersPresent === true, 'PDF visual smoke lost expected header content.');
      expect(result.installedHeadersPresent === true, 'Installed preview pages lost expected header content.');
      expect(result.footersPresent === true, 'PDF visual smoke lost expected footer content.');
      expect(result.chapterFootersResolved === true, 'PDF visual smoke duplicated or lost the resolved chapter footer.');
      expect(result.tocPageNumber === '2', `Expected the TOC to resolve page 2, got ${result.tocPageNumber}.`);
      expect(result.tocLinkScrolled === true, 'The installed preview did not scroll when its TOC link was clicked.');
    }
  }
];

export function expect(condition, message) {
  if (!condition) throw new Error(message);
}
