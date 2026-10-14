import { createPdfArtifact } from './artifact';
import {
  FRAME_READY_MESSAGE,
  PDF_ARTIFACT_SCHEMA_VERSION,
  PDF_PIPELINE_PROTOCOL_VERSION,
  RENDER_PROGRESS_MESSAGE,
  RENDER_REQUEST_MESSAGE,
  RENDER_RESULT_MESSAGE,
  type RenderRequestMessage,
  type RenderResultMessage
} from './contracts';
import { defaultPageAnchor, paginateInFrame, type FrameRendererHooks } from './paginator';

export interface RendererFrameOptions extends FrameRendererHooks {
  /** Defaults to this frame's origin. Use an exact origin, never '*'. */
  readonly parentOrigin?: string;
  readonly stageId?: string;
}

/** Boots the isolated renderer page. Call exactly once from its entry module. */
export function bootPdfRendererFrame(options: RendererFrameOptions = {}): () => void {
  const parentOrigin = options.parentOrigin ?? window.location.origin;
  if (parentOrigin === '*') throw new Error('The PDF renderer requires an exact parent origin.');

  const stage = document.createElement('main');
  stage.id = options.stageId ?? 'isolated-pdf-render-stage';
  document.body.replaceChildren(stage);
  let activeRequestId: string | null = null;

  const receive = async (event: MessageEvent<unknown>): Promise<void> => {
    if (event.origin !== parentOrigin || event.source !== window.parent || !isRenderRequest(event.data)) return;
    const request = event.data;
    if (activeRequestId) {
      postResult(parentOrigin, {
        type: RENDER_RESULT_MESSAGE,
        protocolVersion: PDF_PIPELINE_PROTOCOL_VERSION,
        requestId: request.requestId,
        paginationMs: 0,
        error: 'The PDF renderer frame is already processing a request.'
      });
      return;
    }
    activeRequestId = request.requestId;

    try {
      const pagination = await paginateInFrame(stage, request.input, options, pagesCompleted => {
        window.parent.postMessage({
          type: RENDER_PROGRESS_MESSAGE,
          protocolVersion: PDF_PIPELINE_PROTOCOL_VERSION,
          requestId: request.requestId,
          phase: 'paginate',
          pagesCompleted
        }, parentOrigin);
      });
      const anchorFor = options.pageAnchor ?? defaultPageAnchor;
      const pages = Array.from(stage.querySelectorAll<HTMLElement>('.pagedjs_page')).map((page, index) => {
        const anchor = anchorFor(page, index);
        return anchor ? { number: index + 1, anchor } : { number: index + 1 };
      });
      const artifact = createPdfArtifact({
        schemaVersion: PDF_ARTIFACT_SCHEMA_VERSION,
        artifactId: request.requestId,
        renderId: request.input.renderId,
        html: stage.innerHTML,
        css: pagination.paginationCss,
        pageCount: pagination.pageCount,
        pages
      });
      postResult(parentOrigin, {
        type: RENDER_RESULT_MESSAGE,
        protocolVersion: PDF_PIPELINE_PROTOCOL_VERSION,
        requestId: request.requestId,
        artifact,
        paginationMs: pagination.durationMs
      });
    } catch (error) {
      postResult(parentOrigin, {
        type: RENDER_RESULT_MESSAGE,
        protocolVersion: PDF_PIPELINE_PROTOCOL_VERSION,
        requestId: request.requestId,
        paginationMs: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      activeRequestId = null;
    }
  };

  window.addEventListener('message', receive);
  window.parent.postMessage({
    type: FRAME_READY_MESSAGE,
    protocolVersion: PDF_PIPELINE_PROTOCOL_VERSION
  }, parentOrigin);
  return () => window.removeEventListener('message', receive);
}

function isRenderRequest(value: unknown): value is RenderRequestMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RenderRequestMessage>;
  return candidate.type === RENDER_REQUEST_MESSAGE
    && candidate.protocolVersion === PDF_PIPELINE_PROTOCOL_VERSION
    && typeof candidate.requestId === 'string'
    && candidate.requestId.length > 0
    && candidate.input?.protocolVersion === PDF_PIPELINE_PROTOCOL_VERSION
    && typeof candidate.input.html === 'string'
    && typeof candidate.input.css === 'string'
    && typeof candidate.input.artifactCss === 'string'
    && typeof candidate.input.renderId === 'string';
}

function postResult(parentOrigin: string, result: RenderResultMessage): void {
  window.parent.postMessage(result, parentOrigin);
}
