import { createPdfPreviewJob } from '../pdf-preview/PdfPreviewJobFactory';
import { IsolatedPaginationHost } from '../pdf-preview/IsolatedPaginationHost';
import type { CommittedPreviewTarget } from '../preview/navigation/CommittedPreviewIndex';
import type { EditorCaretStatus } from '../editor/createEditor';
import type { Platform } from '../platform/types';
import { PreviewCoordinator } from './PreviewCoordinator';
import { PaginatedPreviewRenderer } from './PaginatedPreviewRenderer';
import { DocumentRenderCoordinator } from './DocumentRenderCoordinator';
import type { DocumentSessionController } from './DocumentSessionController';
import type { PageGuideCoordinator } from './PageGuideCoordinator';
import type { EditorSaveStatus } from './EditorStatusController';
import { CompiledPreviewCache, captureCurrentPrintLayout } from './CompiledPreviewCache';
import { documentCompileSettings } from '../compiler';
import { state } from '../state';

export interface PreviewPipelineOptions {
  platform: Platform;
  documentSession: DocumentSessionController;
  pagedStage: HTMLElement;
  editorContainer: HTMLElement;
  focusPreviewSourceLine: (line: number) => void;
  focusPreviewSourceTarget: (target: CommittedPreviewTarget) => void;
  flushCurrentDocument: () => Promise<void>;
  getIsSuppressingPreviewNavigation: () => boolean;
  updateSaveStatus: (status: EditorSaveStatus) => void;
  updateActiveSectionLabel: (filename: string | null, customLabel?: string) => void;
  reportWorkflowError: (message: string, error: unknown) => void;
  updateSectionStats: (markdown: string | null) => void;
  updateCaretStatus: (status: EditorCaretStatus | null) => void;
}

/**
 * Builds the preview stack in dependency order: the coordinator, then the
 * paginated renderer (which owns page guides), then the render coordinator.
 * Each piece receives only objects that already exist.
 */
export class PreviewPipeline {
  readonly isolatedPaginationHost = new IsolatedPaginationHost();
  readonly compiledPreviewCache = new CompiledPreviewCache();
  readonly preview: PreviewCoordinator;
  readonly paginatedRenderer: PaginatedPreviewRenderer;
  readonly pageGuides: PageGuideCoordinator;
  readonly renderCoordinator: DocumentRenderCoordinator;

  constructor(opts: PreviewPipelineOptions) {
    const { platform, documentSession } = opts;

    this.preview = new PreviewCoordinator(
      opts.pagedStage,
      platform.assetResolver,
      () => documentCompileSettings(state.current),
      opts.focusPreviewSourceLine,
      opts.focusPreviewSourceTarget,
      (sourceHtml, pageSetup) => createPdfPreviewJob(sourceHtml, captureCurrentPrintLayout(pageSetup), platform.assetResolver),
      this.isolatedPaginationHost
    );

    this.paginatedRenderer = new PaginatedPreviewRenderer({
      preview: this.preview,
      platform,
      compiledPreviewCache: this.compiledPreviewCache,
      isolatedPaginationHost: this.isolatedPaginationHost,
      documentSession,
      flushCurrentDocument: opts.flushCurrentDocument
    });
    this.pageGuides = this.paginatedRenderer.pageGuides;

    const paginated = this.paginatedRenderer;
    this.renderCoordinator = new DocumentRenderCoordinator({
      preview: this.preview,
      platform,
      documentSession,
      pageGuides: this.pageGuides,
      editorContainer: opts.editorContainer,
      compiledPreviewCache: this.compiledPreviewCache,
      getIsFinalPrintPreview: () => paginated.isActive,
      getIsSupressingPreviewNavigation: opts.getIsSuppressingPreviewNavigation,
      scheduleCanonicalPageBreakGuides: () => paginated.scheduleGuides(),
      syncFinalPrintPreviewToggle: () => paginated.syncToggle(),
      updateSaveStatus: opts.updateSaveStatus,
      updateActiveSectionLabel: opts.updateActiveSectionLabel,
      reportWorkflowError: opts.reportWorkflowError,
      updateSectionStats: opts.updateSectionStats,
      updateCaretStatus: opts.updateCaretStatus
    });
  }
}
