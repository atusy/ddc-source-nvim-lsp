// Test cases mirror Shougo/ddc-source-lsp's main_test.ts for byteOffsetToCharacter,
// since that project's HEAD has the same function but it isn't in a published
// release yet (jsr:@shougo/ddc-source-lsp@1.2.0 doesn't export it).
import { byteOffsetToCharacter, toUtf16Index } from "./offset.ts";

import { assertEquals } from "@std/assert/equals";

const ENCODER = new TextEncoder();
function byteLength(s: string): number {
  return ENCODER.encode(s).length;
}

Deno.test("byteOffsetToCharacter - ASCII only, utf-16", () => {
  const line = "abc";
  assertEquals(byteOffsetToCharacter(line, 0, "utf-16"), 0);
  assertEquals(byteOffsetToCharacter(line, 1, "utf-16"), 1);
  assertEquals(byteOffsetToCharacter(line, 3, "utf-16"), 3);
});

Deno.test("byteOffsetToCharacter - multibyte (Japanese), utf-16", () => {
  const line = "日本語[[It";
  const end = byteLength(line); // 13
  assertEquals(byteOffsetToCharacter(line, 0, "utf-16"), 0);
  assertEquals(byteOffsetToCharacter(line, byteLength("日"), "utf-16"), 1);
  assertEquals(byteOffsetToCharacter(line, byteLength("日本語"), "utf-16"), 3);
  assertEquals(byteOffsetToCharacter(line, end, "utf-16"), 7);
});

Deno.test("byteOffsetToCharacter - multibyte (Japanese), utf-8", () => {
  const line = "日本語[[It";
  const end = byteLength(line);
  assertEquals(byteOffsetToCharacter(line, end, "utf-8"), end);
});

Deno.test("byteOffsetToCharacter - surrogate pairs, utf-16", () => {
  const line = "😀!";
  assertEquals(byteOffsetToCharacter(line, 0, "utf-16"), 0);
  assertEquals(byteOffsetToCharacter(line, 4, "utf-16"), 2);
  assertEquals(byteOffsetToCharacter(line, 5, "utf-16"), 3);
});

Deno.test("byteOffsetToCharacter - surrogate pairs, utf-32", () => {
  const line = "😀!";
  assertEquals(byteOffsetToCharacter(line, 4, "utf-32"), 1);
  assertEquals(byteOffsetToCharacter(line, 5, "utf-32"), 2);
});

Deno.test("toUtf16Index - inverts byteOffsetToCharacter on every boundary", () => {
  for (const line of ["abc", "日本語[[It", "😀!"]) {
    const chars = [...line];
    for (let i = 0; i <= chars.length; i++) {
      const prefix = chars.slice(0, i).join("");
      for (const encoding of ["utf-8", "utf-16", "utf-32"] as const) {
        const character = byteOffsetToCharacter(
          line,
          byteLength(prefix),
          encoding,
        );
        assertEquals(
          toUtf16Index(line, character, encoding),
          prefix.length,
          `${line} @${i} (${encoding})`,
        );
      }
    }
  }
});

Deno.test("toUtf16Index - clamps an offset past the end of the line", () => {
  const line = "日本語";
  assertEquals(toUtf16Index(line, 99, "utf-16"), 3);
  assertEquals(toUtf16Index(line, 99, "utf-32"), 3);
  assertEquals(toUtf16Index(line, 99, "utf-8"), 3);
});
