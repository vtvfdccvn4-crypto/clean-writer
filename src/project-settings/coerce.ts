/** Coercion helpers that map unknown input values to typed primitives. */

export function safeText(value: unknown, fallback = '', maxLength = 10_000): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

export function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numericValue)
    ? Math.min(max, Math.max(min, numericValue))
    : fallback;
}

export function safeBool(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return ['true', '1', 'on', 'bold', 'italic'].includes(value.trim().toLowerCase());
  if (typeof value === 'number') return value !== 0;
  return false;
}

export function safeBoolAlias(value: unknown, primary: string, alias: string): boolean {
  const record = value as Record<string, unknown>;
  return safeBool(record[primary]) || safeBool(record[alias]);
}

export function safeBoolWithFallback(value: unknown, fallback: boolean): boolean {
  return value === undefined ? fallback : safeBool(value);
}

export function safeBoolAliasWithFallback(value: unknown, primary: string, alias: string, fallback: boolean): boolean {
  const record = value as Record<string, unknown>;
  return record[primary] === undefined && record[alias] === undefined
    ? fallback
    : safeBoolAlias(record, primary, alias);
}

export function safeColor(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value;
  return fallback;
}
