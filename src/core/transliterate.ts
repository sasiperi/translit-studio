/**
 * Transliteration wrapper — minimal stub.
 * If Sanscript is available, uses it; otherwise returns input unchanged.
 */

type Scheme = string;

let sanscriptT: ((s: string, from: Scheme, to: Scheme) => string) | null = null;

try {
  // Lazy load at runtime (esbuild will inline if dependency exists)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sanscript = require("@indic-transliteration/sanscript");
  if (Sanscript && typeof Sanscript.t === "function") {
    sanscriptT = Sanscript.t.bind(Sanscript);
  }
} catch {
  // Optional dependency; safe to ignore for first builds
}

/** Convert text from `fromScheme` to `toScript`. No-op if backend missing. */
export function transliterate(
  text: string,
  fromScheme: Scheme,
  toScript: Scheme
): string {
  if (sanscriptT) {
    try { return sanscriptT(text, fromScheme, toScript); }
    catch { /* fall through */ }
  }
  return text;
}
