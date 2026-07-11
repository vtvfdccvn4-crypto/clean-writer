export const BLOCK_GLYPH_DIRECTORY = 'assets/glyphs';

const GLYPH_FILE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

export function isBlockGlyphFile(path: string): boolean {
  return GLYPH_FILE_EXTENSION.test(path);
}

export function isBlockGlyphPath(icon: string): boolean {
  const normalized = icon.replace(/\\/g, '/');
  return normalized.toLowerCase().startsWith(`${BLOCK_GLYPH_DIRECTORY}/`) && isBlockGlyphFile(normalized);
}

export function toBlockGlyphPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const glyphRelativePath = normalized.startsWith('assets/glyphs/')
    ? normalized.slice('assets/glyphs/'.length)
    : normalized;
  return `${BLOCK_GLYPH_DIRECTORY}/${glyphRelativePath}`;
}

export function getBlockGlyphLookupPaths(source: string): string[] {
  const normalized = source.trim().replace(/\\/g, '/');
  if (!normalized) return [];
  return Array.from(new Set([
    normalized,
    normalized.startsWith(BLOCK_GLYPH_DIRECTORY) ? normalized : toBlockGlyphPath(normalized)
  ]));
}
