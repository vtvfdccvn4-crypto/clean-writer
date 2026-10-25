import { CompileClient, type CompileOutcome, type WorkerLike } from './CompileClient';
import type { CompileJob } from './compile-protocol';

/** Creates the client that runs compiles in the worker. The worker URL must stay literal so Vite bundles it. */
export function createCompileWorkerClient(compileLocal: (job: CompileJob) => Promise<CompileOutcome>): CompileClient {
  return new CompileClient({
    createWorker: () => new Worker(new URL('./compile.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
    compileLocal
  });
}
