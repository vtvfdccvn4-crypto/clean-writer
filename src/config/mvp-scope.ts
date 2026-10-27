/**
 * Local-folder projects are outside the MVP. They need the File System Access API, which Safari does not
 * have, and the app has no screen yet for resolving an external change to a file. The code stays for
 * development and tests, and the folder options are shown only with `?local-folders=true`.
 */
export function localFolderProjectsEnabled(search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get('local-folders') === 'true';
}
