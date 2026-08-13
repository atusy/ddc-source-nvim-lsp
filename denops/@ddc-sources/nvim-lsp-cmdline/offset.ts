export type OffsetEncoding = "utf-8" | "utf-16" | "utf-32";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/**
 * Convert a UTF-8 byte offset within a line to the character offset expected
 * by the LSP positionEncoding. Adapted from Shougo/ddc-source-lsp, which has
 * the same logic but doesn't export it from a published release yet.
 */
export function byteOffsetToCharacter(
  line: string,
  byteOffset: number,
  offsetEncoding: OffsetEncoding,
): number {
  if (offsetEncoding === "utf-8") {
    return byteOffset;
  }
  const bytes = ENCODER.encode(line);
  const prefix = DECODER.decode(bytes.slice(0, byteOffset));
  if (offsetEncoding === "utf-32") {
    return [...prefix].length;
  }
  return prefix.length;
}

/**
 * Convert a character offset expressed in the LSP positionEncoding into an
 * index into the JavaScript string (UTF-16 code units), the inverse of
 * byteOffsetToCharacter. Offsets past the end of the line clamp to its length:
 * a server may point one past the last character, and an index beyond the
 * string would silently slice to the end anyway.
 */
export function toUtf16Index(
  line: string,
  character: number,
  offsetEncoding: OffsetEncoding,
): number {
  if (offsetEncoding === "utf-16") {
    return Math.min(character, line.length);
  }
  if (offsetEncoding === "utf-32") {
    return [...line].slice(0, character).join("").length;
  }
  const bytes = ENCODER.encode(line);
  return DECODER.decode(bytes.slice(0, character)).length;
}
