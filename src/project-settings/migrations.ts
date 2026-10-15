/** Schema migrations that transform legacy persisted formats to the current shape. */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Schema v4 → v5: TOC used a single global style object; v5 uses per-level styles.
 * Detects the old shape and fans it out to h1–h6.
 */
export function migratePageSetupInput(value: unknown): unknown {
  if (!isPlainObject(value) || !isPlainObject(value.toc)) return value;

  const toc = value.toc;
  const hasLevelStyles = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].some(key => isPlainObject(toc[key]));
  if (hasLevelStyles) return value;

  const isLegacyGlobalStyle = ['fontFamily', 'fontSize', 'color', 'isBold', 'isItalic']
    .some(key => key in toc);
  if (!isLegacyGlobalStyle) return value;

  return {
    ...value,
    toc: {
      maxLevel: 6,
      h1: cloneValue(toc),
      h2: cloneValue(toc),
      h3: cloneValue(toc),
      h4: cloneValue(toc),
      h5: cloneValue(toc),
      h6: cloneValue(toc)
    }
  };
}
