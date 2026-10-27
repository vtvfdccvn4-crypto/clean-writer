/**
 * Where a preview compile runs. The worker is used when `?compile-worker=true` is set, or by default in
 * Safari for documents from 400,000 to 700,000 characters. `?compile-worker=false` keeps every compile on the
 * page. Other browsers stay on the page unless they set the flag. The bounds come from the WebKit evidence in
 * docs/developer/large-document-plan.md, and Chromium is not changed by them.
 */

export const SAFARI_WORKER_MIN_CHARACTERS = 400_000;
export const SAFARI_WORKER_MAX_CHARACTERS = 700_000;

/** The `compile-worker` query value: `true`, `false`, or null when absent or any other value. */
export type CompileWorkerFlag = 'true' | 'false' | null;

export function compileOnWorker(options: { readonly flag: CompileWorkerFlag; readonly safari: boolean; readonly sourceCharacters: number }): boolean {
  if (options.flag === 'true') return true;
  if (options.flag === 'false') return false;
  return options.safari
    && options.sourceCharacters >= SAFARI_WORKER_MIN_CHARACTERS
    && options.sourceCharacters <= SAFARI_WORKER_MAX_CHARACTERS;
}

/** Whether a worker client should exist at all: it is needed when the flag or the Safari default may use it. */
export function compileWorkerMayBeUsed(options: { readonly flag: CompileWorkerFlag; readonly safari: boolean }): boolean {
  return options.flag === 'true' || (options.flag !== 'false' && options.safari);
}
