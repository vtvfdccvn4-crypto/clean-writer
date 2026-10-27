/**
 * Runtime feature flags, read from the page address. Each one is off unless its
 * query parameter is `true`, so a release ships with the flag off until its gate
 * in docs/developer/large-document-plan.md passes.
 */

export function isFlagEnabled(name: string, search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get(name) === 'true';
}

/**
 * The `compile-worker` query value. `true` forces the worker and `false` forces the page; the policy in
 * workers/compile-thread-policy.ts applies when it is absent.
 */
export type CompileWorkerFlagValue = 'true' | 'false' | null;

export function compileWorkerFlag(search: string = typeof window === 'undefined' ? '' : window.location.search): CompileWorkerFlagValue {
  const value = new URLSearchParams(search).get('compile-worker');
  return value === 'true' || value === 'false' ? value : null;
}
