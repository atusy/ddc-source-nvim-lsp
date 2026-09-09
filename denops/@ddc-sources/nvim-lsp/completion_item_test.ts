import type { LSP, OffsetEncoding } from "./deps/lsp.ts";
import { assertBuffer, searchCursor } from "./test_util.ts";
import { CompletionItem } from "./completion_item.ts";
import type { Params } from "./main.ts";

import type { Denops } from "@denops/std";
import * as nvim from "@denops/std/function/nvim";
import { test } from "@denops/test";

import { assertEquals } from "@std/assert/equals";

const params: Params = {
  allowedServers: null,
  confirmBehavior: "insert",
  enableAdditionalTextEdit: true,
  enableDisplayDetail: false,
  enableMatchLabel: false,
  enableResolveItem: false,
  deniedServers: null,
  manualOnlyServers: [],
  snippetEngine: "",
  snippetIndicator: "~",
};

const ClientId = 0 as const satisfies number;
const OffsetEncoding = "utf-16" as const satisfies OffsetEncoding;
const Resolvable = false as const satisfies boolean;

async function setup(args: {
  denops: Denops;
  input: string;
  buffer: string[];
  lspItem: LSP.CompletionItem;
  offsetEncoding?: OffsetEncoding;
}) {
  const { row, col, completePos } = searchCursor(args.buffer, args.input);
  await nvim.nvim_buf_set_lines(args.denops, 0, 0, -1, true, args.buffer);
  await nvim.nvim_win_set_cursor(args.denops, 0, [row, col]);

  const completionItem = new CompletionItem(
    ClientId,
    args.offsetEncoding ?? OffsetEncoding,
    Resolvable,
    args.buffer[row - 1],
    completePos,
    completePos + args.input.length,
    row - 1,
    "~",
  );
  const ddcItem = completionItem.toDdcItem(args.lspItem);
  if (ddcItem === undefined) {
    throw new Error("Protocol violations");
  }
  return ddcItem;
}

function makeRange(
  sl: number,
  sc: number,
  el: number,
  ec: number,
): LSP.Range {
  return {
    start: { line: sl, character: sc },
    end: { line: el, character: ec },
  };
}

test({
  name: "indent fixing completion (vscode-html-language-server)",
  mode: "nvim",
  fn: async (denops) => {
    const lspItem = {
      label: "/div",
      filterText: "  </div",
      textEdit: {
        range: makeRange(1, 0, 1, 5),
        newText: "</div",
      },
    } satisfies LSP.CompletionItem;
    const ddcItem = await setup({
      denops,
      input: "d",
      buffer: [
        "<div>",
        "  </|foo>",
      ],
      lspItem,
    });

    assertEquals(ddcItem.word, "/div");
    assertEquals(ddcItem.abbr, "/div");

    await CompletionItem.confirm(
      denops,
      lspItem,
      lspItem,
      ddcItem.user_data!,
      params,
    );

    await assertBuffer(denops, [
      "<div>",
      "</div|foo>",
    ]);
  },
});

test({
  name: "dot-to-arrow completion (clangd)",
  mode: "nvim",
  fn: async (denops) => {
    const lspItem = {
      label: " prop",
      filterText: "prop",
      textEdit: {
        range: makeRange(0, 3, 0, 5),
        newText: "->prop",
      },
    } satisfies LSP.CompletionItem;
    const ddcItem = await setup({
      denops,
      input: "p",
      buffer: [
        "obj.|foo",
      ],
      lspItem,
    });

    assertEquals(ddcItem.word, "prop");
    assertEquals(ddcItem.abbr, " prop");

    await CompletionItem.confirm(
      denops,
      lspItem,
      lspItem,
      ddcItem.user_data!,
      params,
    );

    await assertBuffer(denops, ["obj->prop|foo"]);
  },
});

test({
  name: "symbol reference completion (typescript-language-server)",
  mode: "nvim",
  fn: async (denops) => {
    const lspItem = {
      label: "Symbol",
      filterText: ".Symbol",
      textEdit: {
        range: makeRange(0, 2, 0, 4),
        newText: "[Symbol]",
      },
    } satisfies LSP.CompletionItem;
    const ddcItem = await setup({
      denops,
      input: "S",
      buffer: [
        "[].|foo",
      ],
      lspItem,
    });

    assertEquals(ddcItem.word, "Symbol");
    assertEquals(ddcItem.abbr, "Symbol");

    await CompletionItem.confirm(
      denops,
      lspItem,
      lspItem,
      ddcItem.user_data!,
      params,
    );

    await assertBuffer(denops, ["[][Symbol]|foo"]);
  },
});

test({
  name: "extreme additionalTextEdits completion (rust-analyzer)",
  mode: "nvim",
  fn: async (denops) => {
    const lspItem = {
      label: "dbg",
      filterText: "dbg",
      textEdit: {
        insert: makeRange(2, 5, 2, 6),
        replace: makeRange(2, 5, 2, 9),
        newText: `dbg!("")`,
      },
      additionalTextEdits: [{
        range: makeRange(1, 10, 2, 5),
        newText: "",
      }],
    } satisfies LSP.CompletionItem;
    const ddcItem = await setup({
      denops,
      input: "d",
      buffer: [
        "fn main() {",
        `  let s = ""`,
        "    .|foo",
        "}",
      ],
      lspItem,
    });

    assertEquals(ddcItem.word, "dbg");
    assertEquals(ddcItem.abbr, "dbg");

    await CompletionItem.confirm(
      denops,
      lspItem,
      lspItem,
      ddcItem.user_data!,
      params,
    );

    await assertBuffer(denops, [
      "fn main() {",
      `  let s = dbg!("")|foo`,
      "}",
    ]);
  },
});

test({
  name: "UTF-8 completion replaces multibyte pre-edit after an emoji",
  mode: "nvim",
  fn: async (denops) => {
    const item: LSP.CompletionItem = {
      label: "漢字",
      textEdit: { range: makeRange(0, 5, 0, 11), newText: "漢字" },
    };
    const ddcItem = await setup({
      denops,
      input: "▽か",
      buffer: ["😀 |tail"],
      lspItem: item,
      offsetEncoding: "utf-8",
    });
    await CompletionItem.confirm(
      denops,
      item,
      item,
      ddcItem.user_data!,
      params,
    );
    await assertBuffer(denops, ["😀 漢字|tail"]);
  },
});

Deno.test("replacement detection compares ranges in the negotiated encoding", () => {
  for (
    const [encoding, start, end] of [
      ["utf-8", 5, 8],
      ["utf-16", 3, 4],
      ["utf-32", 2, 3],
    ] as const
  ) {
    const item = {
      label: "蚊",
      textEdit: { range: makeRange(0, start, 0, end), newText: "蚊" },
    };
    assertEquals(
      CompletionItem.isReplace(item, "replace", 3, 4, "😀 か!", encoding),
      false,
    );
    assertEquals(
      CompletionItem.isReplace(item, "replace", 4, 4, "😀 か!", encoding),
      true,
    );
  }
});

for (
  const [encoding, start, insertEnd, replaceEnd] of [
    ["utf-8", 5, 11, 15],
    ["utf-32", 2, 4, 8],
  ] as const
) {
  test({
    name: `${encoding} InsertReplaceEdit preserves suffix after replacement`,
    mode: "nvim",
    fn: async (denops) => {
      const item: LSP.CompletionItem = {
        label: "漢字",
        textEdit: {
          insert: makeRange(0, start, 0, insertEnd),
          replace: makeRange(0, start, 0, replaceEnd),
          newText: "漢字",
        },
      };
      const ddcItem = await setup({
        denops,
        input: "▽か",
        buffer: ["😀 |tail!"],
        lspItem: item,
        offsetEncoding: encoding,
      });
      await CompletionItem.confirm(denops, item, item, ddcItem.user_data!, {
        ...params,
        confirmBehavior: "replace",
      });
      await assertBuffer(denops, ["😀 漢字|!"]);
    },
  });
}
