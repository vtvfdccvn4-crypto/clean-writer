export type MarkdownHeading = {
  level: number;
  text: string;
  line: number;
};

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = markdown.split(/\r?\n/);

  let inCodeFence = false;
  let currentFenceChar = '';
  let currentFenceLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for fenced code block toggle
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fenceStr = fenceMatch[1];
      const char = fenceStr[0];
      const len = fenceStr.length;

      if (!inCodeFence) {
        inCodeFence = true;
        currentFenceChar = char;
        currentFenceLength = len;
        continue;
      } else if (char === currentFenceChar && len >= currentFenceLength) {
        inCodeFence = false;
        currentFenceChar = '';
        currentFenceLength = 0;
        continue;
      }
    }

    if (inCodeFence) {
      continue;
    }

    // Check for ATX heading
    const headingMatch = line.match(/^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+\s*)?$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2] || '';
      headings.push({
        level,
        text: text.trim(),
        line: i + 1
      });
    }
  }

  return headings;
}
