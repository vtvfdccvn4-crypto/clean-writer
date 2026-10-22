import { state } from '../state';
import { createPrintLayoutSettings } from '../print/PrintLayoutSettings';
import type { CompiledPreview } from '../compiler';

export interface LatestCompiledPreview {
  projectId: string;
  documentPath: string;
  markdown: string;
  compiled: CompiledPreview;
}

/** The last single-document compile, shared by the live render path and page guides. */
export class CompiledPreviewCache {
  latest: LatestCompiledPreview | null = null;
}

/** Exact shared layout input for PDF export and background page guides. */
export function captureCurrentPrintLayout(pageSetup = state.current.pageSetup) {
  return createPrintLayoutSettings({
    pageSetup,
    typographySetup: state.current.typographySetup,
    listSetup: state.current.listSetup,
    tableSetup: state.current.tableSetup,
    imageSetup: state.current.imageSetup,
    projectMetadata: state.current.projectMetadata,
    customStyles: state.current.customStyles,
    customBlockStyles: state.current.customBlockStyles,
    sections: state.current.sections
  });
}
