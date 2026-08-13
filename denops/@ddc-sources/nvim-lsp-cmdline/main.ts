import { BaseSource, type GatherArguments } from "@shougo/ddc-vim/source";
import type { DdcGatherItems, Item } from "@shougo/ddc-vim/types";
import type { Denops } from "@denops/std";

import * as fn from "@denops/std/function";

import { completionContext } from "./context.ts";
import {
  type CompletionResult,
  isIncompleteResult,
  type ItemContext,
  normalizeCompletionResult,
  toItem,
} from "./item.ts";
import { byteOffsetToCharacter, type OffsetEncoding } from "./offset.ts";
import { isClientAllowed } from "../nvim-lsp/client_filter.ts";

export type Params = {
  /** languageId used to open the scratch buffer (as its 'filetype') and sent with
   * textDocument/didOpen by whichever client auto-attaches to it. */
  languageId: string;
  /** Display CompletionItem.detail in the menu column. Off by default, as
   * ddc-source-lsp does: `detail` is free-form server text (a signature, or
   * just which internal source produced the word) and crowds a cmdline pum. */
  enableDisplayDetail: boolean;
  /** Drop items whose inserted text doesn't contain their own label. Off by
   * default: it is a workaround for servers that answer with unrelated text,
   * and it also discards legitimate items whose label is only a description. */
  enableMatchLabel: boolean;
  /** Only query Neovim LSP clients whose names are listed. null means all. */
  allowedServers: string[] | null;
  /** Never query Neovim LSP clients whose names are listed. Deny wins. */
  deniedServers: string[] | null;
};

type CmdlineDoc = { bufnr: number; uri: string };

type Client = {
  id: number;
  name: string;
  offsetEncoding: OffsetEncoding;
  triggerCharacters: string[];
};

export function filterCompletionClients(
  clients: Client[],
  allowedServers: string[] | null,
  deniedServers: string[] | null,
): Client[] {
  return clients.filter((client) =>
    isClientAllowed(client.name, allowedServers, deniedServers)
  );
}

/** One client's answer: its items, plus whether it wants to be re-queried. */
type ClientResult = { items: Item[]; isIncomplete: boolean };

const ENCODER = new TextEncoder();

export class Source extends BaseSource<Params> {
  override async gather(
    args: GatherArguments<Params>,
  ): Promise<DdcGatherItems> {
    const { denops, sourceParams } = args;

    if (args.context.mode !== "c") {
      return [];
    }

    try {
      if (denops.meta.host !== "nvim" || !await fn.has(denops, "nvim-0.11")) {
        return [];
      }

      const doc = await denops.call(
        "luaeval",
        `require("ddc_source_nvim_lsp.cmdline").ensure_buffer(_A[1])`,
        [sourceParams.languageId],
      ) as CmdlineDoc;

      // Give the server the whole line (cursor position is computed from
      // `text` alone below), not just the part before the cursor: a command
      // like ":call getbuf|()" needs the trailing "()" for the server to
      // parse it the same way the user sees it.
      const text = args.context.input;
      const fullLine = text + args.context.nextInput;
      await denops.call(
        "luaeval",
        `require("ddc_source_nvim_lsp.cmdline").set_lines(_A[1], _A[2])`,
        [doc.bufnr, fullLine],
      );

      const clients = filterCompletionClients(
        await denops.call(
          "luaeval",
          `require("ddc_source_nvim_lsp.cmdline").get_clients(_A[1], _A[2])`,
          [doc.bufnr, sourceParams.languageId],
        ) as Client[],
        sourceParams.allowedServers,
        sourceParams.deniedServers,
      );
      if (!clients || clients.length === 0) {
        return [];
      }

      // sourceOptions.timeout is populated by ddc itself (default 2000ms)
      // before gather() ever runs; there is no unset case to fall back from.
      const timeout = args.sourceOptions.timeout;
      const byteLength = ENCODER.encode(text).length;
      const perClient = await Promise.all(
        clients.map((client) =>
          this.#requestCompletion(
            denops,
            client,
            doc,
            text,
            byteLength,
            timeout,
            args.isIncomplete ?? false,
            {
              line: fullLine,
              suggestCharacter: args.completePos,
              offsetEncoding: client.offsetEncoding,
              enableDisplayDetail: sourceParams.enableDisplayDetail,
              enableMatchLabel: sourceParams.enableMatchLabel,
            },
          )
        ),
      );
      return {
        items: perClient.flatMap((result) => result.items),
        // One incomplete list is enough to keep re-querying: the others are
        // cheap to recompute, and dropping the flag would freeze that client's
        // partial answer for the rest of the completion.
        isIncomplete: perClient.some((result) => result.isIncomplete),
      };
    } catch (e) {
      await this.#printError(denops, e);
      return [];
    }
  }

  /** Isolated per client: one client erroring must not drop the others' items. */
  async #requestCompletion(
    denops: Denops,
    client: Client,
    doc: CmdlineDoc,
    text: string,
    byteLength: number,
    timeout: number,
    isIncomplete: boolean,
    itemContext: ItemContext,
  ): Promise<ClientResult> {
    try {
      const character = byteOffsetToCharacter(
        text,
        byteLength,
        client.offsetEncoding,
      );
      const result = await denops.call(
        "luaeval",
        `require("ddc_source_nvim_lsp.cmdline").request_sync(_A[1], _A[2], _A[3], _A[4], _A[5])`,
        [
          client.id,
          "textDocument/completion",
          {
            textDocument: { uri: doc.uri },
            position: { line: 0, character },
            context: completionContext(
              client.triggerCharacters,
              text,
              isIncomplete,
            ),
          },
          timeout,
          doc.bufnr,
        ],
      ) as CompletionResult;
      return {
        items: normalizeCompletionResult(result)
          .map((item) => toItem(item, itemContext))
          .filter((item) => item !== null),
        isIncomplete: isIncompleteResult(result),
      };
    } catch (e) {
      await this.#printError(denops, e);
      return { items: [], isIncomplete: false };
    }
  }

  async #printError(denops: Denops, message: unknown): Promise<void> {
    try {
      await denops.call(
        "ddc#util#print_error",
        message instanceof Error ? message.message : String(message),
        "ddc-source-nvim-lsp",
      );
    } catch {
      // denops.call itself failed (e.g. RPC channel down): fall back to the
      // worker's stderr, which denops.vim surfaces independently of the RPC
      // path that just failed, instead of silently reporting nothing.
      console.error("ddc-source-nvim-lsp:", message);
    }
  }

  override params(): Params {
    return {
      languageId: "vim",
      enableDisplayDetail: false,
      enableMatchLabel: false,
      allowedServers: null,
      deniedServers: null,
    };
  }
}
