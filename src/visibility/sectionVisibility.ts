import type { FileNode } from '../state';
import { getPathChain, normalizeExplorerPath } from '../utils/path-utils';

export interface ResolvedSectionVisibility {
  hideHeader: boolean;
  hideFooter: boolean;
  matchedHeaderPath: string | null;
  matchedFooterPath: string | null;
  numberHeadings: boolean;
  matchedNumberingPath: string | null;
  includeInToc: boolean;
  matchedTocPath: string | null;
}

export function resolveSectionVisibility(
  sections: Pick<FileNode, 'path' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>[],
  rawPath: string
): ResolvedSectionVisibility {
  const normalizedPath = normalizeExplorerPath(rawPath);
  const chain = getPathChain(normalizedPath);
  const sectionByPath = new Map<string, Pick<FileNode, 'path' | 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc'>>();

  for (const section of sections) {
    const path = normalizeExplorerPath(section.path);
    if (!sectionByPath.has(path)) {
      sectionByPath.set(path, section);
    }
  }

  const resolveFlag = (flag: 'hideHeader' | 'hideFooter' | 'numberHeadings' | 'includeInToc') => {
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = sectionByPath.get(chain[i]);
      if (node?.[flag]) {
        return chain[i];
      }
    }
    return null;
  };

  const matchedHeaderPath = resolveFlag('hideHeader');
  const matchedFooterPath = resolveFlag('hideFooter');
  const matchedNumberingPath = resolveFlag('numberHeadings');
  const matchedTocPath = resolveFlag('includeInToc');

  return {
    hideHeader: matchedHeaderPath !== null,
    hideFooter: matchedFooterPath !== null,
    matchedHeaderPath,
    matchedFooterPath,
    numberHeadings: matchedNumberingPath !== null,
    matchedNumberingPath,
    includeInToc: matchedTocPath !== null,
    matchedTocPath
  };
}
