import type { WorkspaceSession } from '../platform/types';
import type { FileNode } from '../types';

export type ProjectSearchResult = {
  path: string;
  line: number;
  column: number;
  excerpt: string;
};

export async function searchProject(
  session: WorkspaceSession,
  sections: FileNode[],
  query: string,
  signal?: AbortSignal,
  limit: number = 100
): Promise<ProjectSearchResult[]> {
  if (!query || query.trim() === '') return [];
  
  const results: ProjectSearchResult[] = [];
  const lowerQuery = query.toLowerCase();
  
  for (const section of sections) {
    if (signal?.aborted) break;
    if (section.isDir) continue;

    const content = await session.readSection(section.path);
    if (signal?.aborted) break;

    const lowerContent = content.toLowerCase();
    let startIndex = 0;
    
    while ((startIndex = lowerContent.indexOf(lowerQuery, startIndex)) !== -1) {
      if (signal?.aborted) break;
      if (results.length >= limit) break;

      // Calculate line and column
      const textBeforeMatch = content.substring(0, startIndex);
      const newlines = textBeforeMatch.match(/\n/g);
      const line = newlines ? newlines.length + 1 : 1;
      const lastNewlineIndex = textBeforeMatch.lastIndexOf('\n');
      const column = lastNewlineIndex === -1 ? startIndex : startIndex - lastNewlineIndex - 1;

      // Extract excerpt (approx 40 chars before and after)
      const excerptStart = Math.max(0, startIndex - 40);
      const excerptEnd = Math.min(content.length, startIndex + query.length + 40);
      
      let excerpt = content.substring(excerptStart, excerptEnd);
      // Clean up excerpt to not start or end abruptly with a split word, unless at boundaries
      // To keep it simple and fast, just replace newlines with spaces
      excerpt = excerpt.replace(/\r?\n/g, ' ').trim();
      
      // Add ellipsis if truncated
      if (excerptStart > 0) excerpt = '…' + excerpt;
      if (excerptEnd < content.length) excerpt = excerpt + '…';

      results.push({
        path: section.path,
        line,
        column,
        excerpt
      });

      startIndex += query.length;
    }

    if (results.length >= limit) break;
  }

  return results;
}
