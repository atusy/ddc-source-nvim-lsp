import {
  isIncompleteResult,
  type ItemContext,
  normalizeCompletionResult,
  toItem,
} from "./item.ts";

import { assertEquals } from "@std/assert/equals";

/** Cursor at the end of an empty command line: no line text to fix up. */
const CTX: ItemContext = {
  line: "",
  suggestCharacter: 0,
  offsetEncoding: "utf-16",
};

Deno.test("toItem - uses insertText as word when present", () => {
  assertEquals(
    toItem({ label: "nu", insertText: "number" }, CTX),
    { word: "number", abbr: "nu", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - falls back to label as word when insertText is absent", () => {
  assertEquals(
    toItem({ label: "number" }, CTX),
    { word: "number", abbr: "number", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - trims a padded label before using it as word", () => {
  assertEquals(
    toItem({ label: " number " }, CTX),
    { word: "number", abbr: " number ", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - shows the CompletionItemKind name as kind", () => {
  assertEquals(
    toItem({ label: "getbufline", kind: 3 }, CTX),
    { word: "getbufline", abbr: "getbufline", kind: "Function", menu: "" },
  );
  assertEquals(
    toItem({ label: "shiftwidth", kind: 14 }, CTX),
    { word: "shiftwidth", abbr: "shiftwidth", kind: "Keyword", menu: "" },
  );
  assertEquals(
    toItem({ label: "T", kind: 25 }, CTX),
    { word: "T", abbr: "T", kind: "TypeParameter", menu: "" },
  );
});

Deno.test("toItem - kind defaults to Text when the item has none", () => {
  assertEquals(
    toItem({ label: "getbufline" }, CTX),
    { word: "getbufline", abbr: "getbufline", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - kind is empty for a number outside CompletionItemKind", () => {
  assertEquals(
    toItem({ label: "getbufline", kind: 99 }, CTX),
    { word: "getbufline", abbr: "getbufline", kind: "", menu: "" },
  );
  assertEquals(
    toItem({ label: "getbufline", kind: 0 }, CTX),
    { word: "getbufline", abbr: "getbufline", kind: "", menu: "" },
  );
});

Deno.test("toItem - detail goes to the menu column, not kind", () => {
  const lspItem = { label: "getbufline", kind: 3, detail: "list<string>" };
  assertEquals(
    toItem(lspItem, { ...CTX, enableDisplayDetail: true }),
    {
      word: "getbufline",
      abbr: "getbufline",
      kind: "Function",
      menu: "list<string>",
    },
  );
  // Off by default: detail never falls back into the kind column.
  assertEquals(
    toItem(lspItem, CTX),
    { word: "getbufline", abbr: "getbufline", kind: "Function", menu: "" },
  );
});

Deno.test("toItem - enableMatchLabel drops an item whose text is not its label", () => {
  const ctx: ItemContext = { ...CTX, enableMatchLabel: true };
  assertEquals(
    toItem({ label: "number", insertText: "nu" }, ctx),
    null,
  );
  assertEquals(
    toItem({ label: "nu", insertText: "number" }, ctx),
    { word: "number", abbr: "nu", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - enableMatchLabel ignores decorators around the label", () => {
  // Servers pad or bullet labels for display; that is not a mismatch.
  assertEquals(
    toItem({ label: "•atan2", insertText: "atan2" }, {
      ...CTX,
      enableMatchLabel: true,
    }),
    { word: "atan2", abbr: "•atan2", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - a mismatched item is kept while enableMatchLabel is off", () => {
  assertEquals(
    toItem({ label: "number", insertText: "nu" }, CTX),
    { word: "nu", abbr: "number", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - a deprecated item is struck through", () => {
  const highlights = [{
    type: "abbr",
    name: "ddc-source-nvim-lsp-deprecated",
    hl_group: "DdcLspCmdlineDeprecated",
    col: 1,
    width: 10,
  }];
  assertEquals(
    toItem({ label: "getbufline", deprecated: true }, CTX)?.highlights,
    highlights,
  );
  // CompletionItemTag.Deprecated, the replacement for the deprecated flag.
  assertEquals(
    toItem({ label: "getbufline", tags: [1] }, CTX)?.highlights,
    highlights,
  );
});

Deno.test("toItem - the strikethrough spans the label in bytes", () => {
  // The highlight is applied by column, and pum.vim counts columns in bytes.
  assertEquals(
    toItem({ label: "日本語", deprecated: true }, CTX)?.highlights?.[0].width,
    9,
  );
});

Deno.test("toItem - an item that is not deprecated has no highlight", () => {
  assertEquals(toItem({ label: "getbufline" }, CTX)?.highlights, undefined);
  assertEquals(
    toItem({ label: "getbufline", deprecated: false }, CTX)?.highlights,
    undefined,
  );
  // Any other tag (1 is the only one defined so far) means nothing here.
  assertEquals(
    toItem({ label: "getbufline", tags: [2] }, CTX)?.highlights,
    undefined,
  );
});

Deno.test("toItem - textEdit starting before the completion position drops the overlap", () => {
  // ":se|" with ddc completing from "se": the server replaces the whole word,
  // so the item's text already contains the "se" ddc will keep.
  const ctx: ItemContext = { ...CTX, line: "se", suggestCharacter: 0 };
  assertEquals(
    toItem({
      label: "set",
      textEdit: {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 2 },
        },
        newText: "set",
      },
    }, ctx),
    { word: "set", abbr: "set", kind: "Text", menu: "" },
  );

  // Same item, but ddc completes from after "s.": the edit reaches back one
  // character further than ddc does, so that character must be dropped.
  assertEquals(
    toItem({
      label: "s:func",
      textEdit: {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 9 },
        },
        newText: "s:func",
      },
    }, { ...CTX, line: "call s:fu", suggestCharacter: 7 }),
    { word: "func", abbr: "s:func", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - keeps ddc's position when the line prefix does not match the item", () => {
  // The edit reaches back over "x:", which "s:func" does not start with:
  // splicing it in would produce "callx:s:func". Fall back to ddc's position.
  assertEquals(
    toItem({
      label: "s:func",
      textEdit: {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 9 },
        },
        newText: "s:func",
      },
    }, { ...CTX, line: "call x:fu", suggestCharacter: 7 }),
    { word: "s:func", abbr: "s:func", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - insertReplaceEdit is read from its insert range", () => {
  assertEquals(
    toItem({
      label: "set",
      textEdit: {
        insert: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 2 },
        },
        replace: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        newText: "set",
      },
    }, { ...CTX, line: "se", suggestCharacter: 1 }),
    { word: "et", abbr: "set", kind: "Text", menu: "" },
  );
});

Deno.test("toItem - drops an item whose edit is not on the command line", () => {
  // The document is one line; an edit anywhere else cannot be applied.
  assertEquals(
    toItem({
      label: "set",
      textEdit: {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 2 },
        },
        newText: "set",
      },
    }, { ...CTX, line: "se", suggestCharacter: 0 }),
    null,
  );
  assertEquals(
    toItem({
      label: "set",
      textEdit: {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 2 },
        },
        newText: "set",
      },
    }, { ...CTX, line: "se", suggestCharacter: 0 }),
    null,
  );
});

Deno.test("toItem - textEdit character offsets follow the client's encoding", () => {
  // "あ" is 3 bytes in utf-8 but one UTF-16 unit: character 3 is the "s".
  assertEquals(
    toItem({
      label: "set",
      textEdit: {
        range: {
          start: { line: 0, character: 3 },
          end: { line: 0, character: 5 },
        },
        newText: "set",
      },
    }, { line: "あse", suggestCharacter: 2, offsetEncoding: "utf-8" }),
    { word: "et", abbr: "set", kind: "Text", menu: "" },
  );
});

Deno.test("isIncompleteResult - only a CompletionList can be incomplete", () => {
  assertEquals(isIncompleteResult({ items: [], isIncomplete: true }), true);
  assertEquals(isIncompleteResult({ items: [], isIncomplete: false }), false);
  // A bare CompletionItem[] is complete by definition, and a list that omits
  // the field (or fills it with junk) is not a re-query candidate either.
  assertEquals(isIncompleteResult([{ label: "a" }]), false);
  assertEquals(isIncompleteResult({ items: [] }), false);
  assertEquals(
    isIncompleteResult({ items: [], isIncomplete: "yes" } as unknown as {
      items: [];
    }),
    false,
  );
  assertEquals(isIncompleteResult(null), false);
  assertEquals(isIncompleteResult(undefined), false);
});

Deno.test("normalizeCompletionResult - null/undefined result is no items", () => {
  assertEquals(normalizeCompletionResult(null), []);
  assertEquals(normalizeCompletionResult(undefined), []);
});

Deno.test("normalizeCompletionResult - bare CompletionItem[] response", () => {
  const items = [{ label: "a" }, { label: "b" }];
  assertEquals(normalizeCompletionResult(items), items);
});

Deno.test("normalizeCompletionResult - well-formed CompletionList response", () => {
  const items = [{ label: "a" }];
  assertEquals(
    normalizeCompletionResult({ items, isIncomplete: false }),
    items,
  );
});

Deno.test("normalizeCompletionResult - CompletionList with missing items is no items", () => {
  assertEquals(normalizeCompletionResult({ isIncomplete: true }), []);
});

Deno.test("normalizeCompletionResult - CompletionList with non-array items is no items", () => {
  assertEquals(normalizeCompletionResult({ items: null }), []);
});

Deno.test("normalizeCompletionResult - drops elements without a string label, keeps the rest", () => {
  const items = [
    { label: "a" },
    null,
    { label: 42 },
    { notLabel: "b" },
    { label: "c" },
  ] as unknown as { label: string }[];
  assertEquals(normalizeCompletionResult(items), [{ label: "a" }, {
    label: "c",
  }]);
});

Deno.test("toItem - falls back to label when insertText is a snippet", () => {
  assertEquals(
    toItem({
      label: "getbufline(...)",
      insertText: "getbufline(${1:buf})",
      insertTextFormat: 2,
    }, CTX),
    {
      word: "getbufline(...)",
      abbr: "getbufline(...)",
      kind: "Text",
      menu: "",
    },
  );
});

Deno.test("toItem - uses insertText when insertTextFormat is plain text", () => {
  assertEquals(
    toItem({ label: "nu", insertText: "number", insertTextFormat: 1 }, CTX),
    { word: "number", abbr: "nu", kind: "Text", menu: "" },
  );
});

Deno.test("normalizeCompletionResult - drops a non-string insertText, falls back to label", () => {
  const items = [{ label: "ok", insertText: 42 }] as unknown as {
    label: string;
  }[];
  assertEquals(normalizeCompletionResult(items), [{ label: "ok" }]);
});

Deno.test("normalizeCompletionResult - drops a non-string detail", () => {
  const items = [{ label: "ok", detail: { not: "a string" } }] as unknown as {
    label: string;
  }[];
  assertEquals(normalizeCompletionResult(items), [{ label: "ok" }]);
});

Deno.test("normalizeCompletionResult - drops a non-number kind", () => {
  const items = [{ label: "ok", kind: "Function" }] as unknown as {
    label: string;
  }[];
  assertEquals(normalizeCompletionResult(items), [{ label: "ok" }]);
});

Deno.test("normalizeCompletionResult - keeps deprecated markers, drops malformed ones", () => {
  const items = [
    { label: "a", deprecated: true, tags: [1] },
    { label: "b", deprecated: "yes", tags: "deprecated" },
    { label: "c", tags: [1, "deprecated", null] },
  ] as unknown as { label: string }[];
  assertEquals(normalizeCompletionResult(items), [
    { label: "a", deprecated: true, tags: [1] },
    { label: "b" },
    { label: "c", tags: [1] },
  ]);
});

Deno.test("normalizeCompletionResult - drops a non-number insertTextFormat", () => {
  const items = [{ label: "ok", insertTextFormat: "snippet" }] as unknown as {
    label: string;
  }[];
  assertEquals(normalizeCompletionResult(items), [{ label: "ok" }]);
});

Deno.test("normalizeCompletionResult - keeps well-typed optional fields", () => {
  const item = {
    label: "ok",
    insertText: "OK",
    detail: "d",
    insertTextFormat: 2,
    kind: 3,
  };
  assertEquals(normalizeCompletionResult([item]), [item]);
});

Deno.test("normalizeCompletionResult - applies itemDefaults.insertTextFormat to items missing their own", () => {
  const result = {
    items: [{ label: "a", insertText: "a(${1:x})" }],
    itemDefaults: { insertTextFormat: 2 },
  };
  assertEquals(normalizeCompletionResult(result), [
    { label: "a", insertText: "a(${1:x})", insertTextFormat: 2 },
  ]);
});

Deno.test("normalizeCompletionResult - item-level insertTextFormat overrides itemDefaults", () => {
  const result = {
    items: [{ label: "a", insertText: "a", insertTextFormat: 1 }],
    itemDefaults: { insertTextFormat: 2 },
  };
  assertEquals(normalizeCompletionResult(result), [
    { label: "a", insertText: "a", insertTextFormat: 1 },
  ]);
});

Deno.test("normalizeCompletionResult - bare CompletionItem[] response has no itemDefaults to apply", () => {
  const items = [{ label: "a", insertText: "a(${1:x})" }];
  assertEquals(normalizeCompletionResult(items), items);
});

Deno.test("normalizeCompletionResult - itemDefaults.editRange becomes a textEdit", () => {
  const range = {
    start: { line: 0, character: 4 },
    end: { line: 0, character: 6 },
  };
  assertEquals(
    normalizeCompletionResult({
      items: [{ label: "set" }, { label: "setlocal", textEditText: "setl" }],
      itemDefaults: { editRange: range },
    }),
    [
      { label: "set", textEdit: { range, newText: "set" } },
      {
        label: "setlocal",
        textEditText: "setl",
        textEdit: { range, newText: "setl" },
      },
    ],
  );
});

Deno.test("normalizeCompletionResult - itemDefaults.editRange keeps insert/replace ranges", () => {
  const insert = {
    start: { line: 0, character: 4 },
    end: { line: 0, character: 6 },
  };
  const replace = {
    start: { line: 0, character: 4 },
    end: { line: 0, character: 9 },
  };
  assertEquals(
    normalizeCompletionResult({
      items: [{ label: "set" }],
      itemDefaults: { editRange: { insert, replace } },
    }),
    [{ label: "set", textEdit: { insert, replace, newText: "set" } }],
  );
});

Deno.test("normalizeCompletionResult - an item's own textEdit wins over itemDefaults", () => {
  const own = {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
    newText: "set",
  };
  assertEquals(
    normalizeCompletionResult({
      items: [{ label: "set", textEdit: own }],
      itemDefaults: {
        editRange: {
          start: { line: 0, character: 4 },
          end: { line: 0, character: 6 },
        },
      },
    }),
    [{ label: "set", textEdit: own }],
  );
});

Deno.test("normalizeCompletionResult - drops a malformed textEdit, keeps the item", () => {
  const items = [
    { label: "a", textEdit: { range: { start: { line: 0 } }, newText: "a" } },
    { label: "b", textEdit: { range: null, newText: "b" } },
    {
      label: "c",
      textEdit: {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      },
    },
    { label: "d", textEdit: "nope" },
  ] as unknown as { label: string }[];
  assertEquals(normalizeCompletionResult(items), [
    { label: "a" },
    { label: "b" },
    { label: "c" },
    { label: "d" },
  ]);
});
