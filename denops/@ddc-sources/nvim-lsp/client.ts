import type { OffsetEncoding } from "./deps/lsp.ts";
import type { LSP } from "./deps/lsp.ts";
import type { Denops } from "@denops/std";

export type Client = {
  id: number;
  name: string;
  provider: Exclude<LSP.ServerCapabilities["completionProvider"], undefined>;
  offsetEncoding: OffsetEncoding;
};

export async function getClients(
  denops: Denops,
  bufnr?: number,
): Promise<Client[]> {
  return await denops.call(
    "luaeval",
    `require("ddc_source_nvim_lsp.internal").get_clients(_A[1])`,
    [bufnr],
  ) as Client[];
}
