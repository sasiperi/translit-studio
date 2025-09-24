/** Token helpers — minimal stubs */

/** Return the last non-whitespace token before the caret. */
export function lastTokenRange(text: string, caret: number): { start: number; end: number; token: string } {
  const clamped = Math.max(0, Math.min(caret, text.length));
  const slice = text.slice(0, clamped);
  const m = slice.match(/([^\s]+)$/);
  if (!m) return { start: clamped, end: clamped, token: "" };
  const token = m[1];
  const start = clamped - token.length;
  return { start, end: clamped, token };
}

/** Split on whitespace while preserving order (drops empties). */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}
