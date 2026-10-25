/**
 * Runtime feature flags, read from the page address. Each one is off unless its
 * query parameter is `true`, so a release ships with the flag off until its gate
 * in docs/developer/large-document-plan.md passes.
 */

export function isFlagEnabled(name: string, search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get(name) === 'true';
}

/** Compiles the full document in a worker instead of on the page's main thread. */
export const isCompileWorkerEnabled = (search?: string): boolean => isFlagEnabled('compile-worker', search);
