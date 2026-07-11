export type WritingStatistics = {
  words: number;
  charactersWithSpaces: number;
  charactersWithoutSpaces: number;
  estimatedReadingTimeMinutes: number;
};

// Assuming 250 words per minute for reading speed.
export const WORDS_PER_MINUTE = 250;

export function calculateReadingTime(words: number): number {
  if (words <= 0) return 0;
  const rawMinutes = words / WORDS_PER_MINUTE;
  return Math.max(1, Math.round(rawMinutes * 10) / 10);
}

/**
 * Extracts writing statistics from Markdown source.
 * 
 * Markdown Treatment:
 * - YAML front matter: Stripped before counting.
 * - HTML Tags: Stripped out before counting.
 * - Links: The raw URL is removed, but the visible link text is kept and counted.
 * - Fenced code blocks: Excluded from the counted text.
 * - Words: Tokenized by alphanumeric sequences, ignoring punctuation.
 */
export function extractWritingStatistics(markdown: string): WritingStatistics {
  if (!markdown) {
    return {
      words: 0,
      charactersWithSpaces: 0,
      charactersWithoutSpaces: 0,
      estimatedReadingTimeMinutes: 0
    };
  }

  const text = normalizeMarkdownForStats(markdown);

  // 4. Calculate character counts (from the raw cleaned text, preserving original spacing for `withSpaces`)
  const charactersWithSpaces = text.length;
  
  // Remove all whitespace characters to count non-space characters
  const textWithoutSpaces = text.replace(/\s/g, '');
  const charactersWithoutSpaces = textWithoutSpaces.length;

  // 5. Tokenize words
  // Match contiguous sequences of letters, numbers, and interior hyphens or underscores
  // \p{L} = letters, \p{N} = numbers. Requires 'u' flag for unicode support.
  const wordMatches = text.match(/[\p{L}\p{N}\-_]+/gu);
  const words = wordMatches ? wordMatches.length : 0;

  // 6. Calculate reading time (rounded to 1 decimal place, minimum 1 if > 0)
  const estimatedReadingTimeMinutes = calculateReadingTime(words);

  return {
    words,
    charactersWithSpaces,
    charactersWithoutSpaces,
    estimatedReadingTimeMinutes
  };
}

function normalizeMarkdownForStats(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let start = 0;
  let end = lines.length;

  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        start = i + 1;
        break;
      }
    }
  }

  const cleaned: string[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;

  for (let i = start; i < end; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const currentFence = fenceMatch[1];
      const char = currentFence[0];
      const length = currentFence.length;
      if (!inFence) {
        inFence = true;
        fenceChar = char;
        fenceLength = length;
      } else if (char === fenceChar && length >= fenceLength) {
        inFence = false;
        fenceChar = '';
        fenceLength = 0;
      }
      continue;
    }

    if (inFence) continue;

    cleaned.push(
      line
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    );
  }

  return cleaned.join('\n');
}
