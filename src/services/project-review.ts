import { extractMarkdownHeadings } from '../editor/markdown-headings';
import { extractWritingStatistics } from '../editor/writing-statistics';
import type { FileNode } from '../types';
import type { WorkspaceSession } from '../platform/types';

export type ProjectReviewKind = 'duplicate-heading' | 'empty-section' | 'heading-level-jump' | 'long-section';

export interface ProjectReviewResult {
  kind: ProjectReviewKind;
  path: string;
  line: number;
  title: string;
  detail: string;
}

export const LONG_SECTION_WORD_LIMIT = 2000;

export async function reviewProject(
  session: WorkspaceSession,
  sections: readonly FileNode[],
  signal?: AbortSignal
): Promise<ProjectReviewResult[]> {
  const results: ProjectReviewResult[] = [];
  const documents: Array<{ path: string; markdown: string }> = [];

  for (const section of sections) {
    if (section.isDir) continue;
    if (signal?.aborted) return [];
    documents.push({ path: section.path, markdown: await session.readSection(section.path) });
  }

  const headingOccurrences = new Map<string, Array<{ path: string; line: number }>>();
  for (const document of documents) {
    if (signal?.aborted) return [];
    const headings = extractMarkdownHeadings(document.markdown);
    if (!document.markdown.trim()) {
      results.push({ kind: 'empty-section', path: document.path, line: 1, title: 'Empty section', detail: 'This section has no Markdown content.' });
    }

    let previousLevel = 0;
    for (const heading of headings) {
      const key = heading.text.trim().toLocaleLowerCase();
      if (key) {
        const occurrences = headingOccurrences.get(key) ?? [];
        occurrences.push({ path: document.path, line: heading.line });
        headingOccurrences.set(key, occurrences);
      }
      if (previousLevel > 0 && heading.level > previousLevel + 1) {
        results.push({
          kind: 'heading-level-jump',
          path: document.path,
          line: heading.line,
          title: 'Heading level jump',
          detail: `Heading level ${heading.level} follows level ${previousLevel}.`
        });
      }
      previousLevel = heading.level;
    }

    const words = extractWritingStatistics(document.markdown).words;
    if (words > LONG_SECTION_WORD_LIMIT) {
      results.push({
        kind: 'long-section',
        path: document.path,
        line: 1,
        title: 'Very long section',
        detail: `${words.toLocaleString()} words, over the ${LONG_SECTION_WORD_LIMIT.toLocaleString()}-word review threshold.`
      });
    }
  }

  for (const [heading, occurrences] of headingOccurrences) {
    if (occurrences.length < 2) continue;
    for (const occurrence of occurrences) {
      results.push({
        kind: 'duplicate-heading',
        path: occurrence.path,
        line: occurrence.line,
        title: 'Duplicate heading',
        detail: `“${heading}” appears ${occurrences.length} times in the project.`
      });
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.title.localeCompare(b.title));
}
