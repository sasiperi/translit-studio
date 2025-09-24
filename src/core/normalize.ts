/** Text normalization utilities — minimal stubs */

export function toNFC(text: string): string {
  try { return text.normalize("NFC"); } catch { return text; }
}

export function toNFD(text: string): string {
  try { return text.normalize("NFD"); } catch { return text; }
}

/** Normalize newlines to LF and trim trailing spaces per line. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}
