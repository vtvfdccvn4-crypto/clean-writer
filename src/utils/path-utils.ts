export function normalizeExplorerPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/$/, '');
}

export function getBaseName(rawPath: string): string {
  const normalized = normalizeExplorerPath(rawPath);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function getParentPath(rawPath: string): string | null {
  const normalized = normalizeExplorerPath(rawPath);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

export function getAncestorFolders(rawPath: string): string[] {
  const normalized = normalizeExplorerPath(rawPath);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return [];

  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join('/'));
  }
  return ancestors;
}

export function isDescendantPath(parentPath: string, candidatePath: string): boolean {
  const normalizedParent = normalizeExplorerPath(parentPath);
  const normalizedCandidate = normalizeExplorerPath(candidatePath);
  return normalizedCandidate.length > normalizedParent.length && normalizedCandidate.startsWith(`${normalizedParent}/`);
}

export function getPathChain(rawPath: string): string[] {
  const normalized = normalizeExplorerPath(rawPath);
  if (!normalized) return [];

  const parts = normalized.split('/').filter(Boolean);
  const chain: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    chain.push(parts.slice(0, i).join('/'));
  }
  return chain;
}

export function replacePathPrefix(rawPath: string, oldPrefix: string, newPrefix: string): string {
  const path = normalizeExplorerPath(rawPath);
  const normalizedOldPrefix = normalizeExplorerPath(oldPrefix);
  const normalizedNewPrefix = normalizeExplorerPath(newPrefix);

  if (path === normalizedOldPrefix) return normalizedNewPrefix;
  if (isDescendantPath(normalizedOldPrefix, path)) {
    return `${normalizedNewPrefix}${path.slice(normalizedOldPrefix.length)}`;
  }
  return path;
}
