import { compileJob, CompileResultCache } from './compile-core';
import { COMPILE_PROTOCOL_VERSION, wallClockMs, type CompileWorkerRequest, type CompileWorkerResponse } from './compile-protocol';

/** Worker entry: runs compile jobs in order and reports results or errors by job id. */

const cache = new CompileResultCache();
const cancelled = new Set<string>();
const scope = self as unknown as {
  postMessage(message: CompileWorkerResponse): void;
  onmessage: ((event: MessageEvent<CompileWorkerRequest>) => void) | null;
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

scope.postMessage({ type: 'ready', protocol: COMPILE_PROTOCOL_VERSION });

scope.onmessage = async (event: MessageEvent<CompileWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelled.add(request.jobId);
    return;
  }
  if (request.type !== 'compile' || request.protocol !== COMPILE_PROTOCOL_VERSION) {
    scope.postMessage({ type: 'error', jobId: '', message: 'The compile request uses an unsupported protocol.' });
    return;
  }

  const jobId = request.job.jobId;
  const workerReceivedAt = wallClockMs();
  try {
    const outcome = await compileJob(request.job, cache);
    const workerCompiledAt = wallClockMs();
    // A job cancelled while it ran produces no result: nobody is waiting for it.
    if (cancelled.delete(jobId)) return;
    scope.postMessage({ type: 'result', jobId, ...outcome, timing: { workerReceivedAt, workerCompiledAt, workerPostedAt: wallClockMs() } });
  } catch (error) {
    cancelled.delete(jobId);
    scope.postMessage({ type: 'error', jobId, message: describe(error) });
  }
};
