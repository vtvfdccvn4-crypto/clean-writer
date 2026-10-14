import {
  CONNECT_MESSAGE,
  PDF_PREVIEW_PROTOCOL_VERSION,
  PROGRESS_MESSAGE,
  READY_MESSAGE,
  RENDER_MESSAGE,
  RESULT_MESSAGE,
  type ConnectMessage,
  type ProgressMessage,
  type ReadyMessage,
  type RenderMessage,
  type ResultMessage
} from './contracts';

export function isConnectMessage(value: unknown): value is ConnectMessage {
  const candidate = record(value);
  return candidate?.type === CONNECT_MESSAGE
    && candidate.protocolVersion === PDF_PREVIEW_PROTOCOL_VERSION
    && nonEmptyString(candidate.channelId);
}

export function isReadyMessage(value: unknown, channelId: string): value is ReadyMessage {
  const candidate = record(value);
  return candidate?.type === READY_MESSAGE
    && candidate.protocolVersion === PDF_PREVIEW_PROTOCOL_VERSION
    && candidate.channelId === channelId;
}

export function isRenderMessage(value: unknown): value is RenderMessage {
  const candidate = record(value);
  const input = record(candidate?.input);
  return candidate?.type === RENDER_MESSAGE
    && candidate.protocolVersion === PDF_PREVIEW_PROTOCOL_VERSION
    && nonEmptyString(candidate.requestId)
    && input?.protocolVersion === PDF_PREVIEW_PROTOCOL_VERSION
    && validRenderId(input.renderId)
    && nonEmptyString(input.html)
    && nonEmptyString(input.css)
    && typeof input.artifactCss === 'string';
}

export function isProgressMessage(value: unknown, requestId: string): value is ProgressMessage {
  const candidate = record(value);
  return candidate?.type === PROGRESS_MESSAGE
    && candidate.protocolVersion === PDF_PREVIEW_PROTOCOL_VERSION
    && candidate.requestId === requestId
    && Number.isSafeInteger(candidate.pagesCompleted)
    && Number(candidate.pagesCompleted) >= 0;
}

export function isResultMessage(value: unknown, requestId: string): value is ResultMessage {
  const candidate = record(value);
  return candidate?.type === RESULT_MESSAGE
    && candidate.protocolVersion === PDF_PREVIEW_PROTOCOL_VERSION
    && candidate.requestId === requestId
    && typeof candidate.paginationMs === 'number'
    && Number.isFinite(candidate.paginationMs)
    && candidate.paginationMs >= 0
    && (candidate.error === undefined || typeof candidate.error === 'string')
    && (candidate.artifact === undefined || typeof candidate.artifact === 'object');
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validRenderId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}
