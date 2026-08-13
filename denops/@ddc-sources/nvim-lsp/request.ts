import type { Client } from "./client.ts";

import type { Denops } from "@denops/std";
import { register } from "@denops/std/lambda";

import { deadline } from "@std/async/deadline";

type RequestOptions = {
  client: Client;
  timeout: number;
  sync: boolean;
  bufnr?: number;
};

export async function request(
  denops: Denops,
  method: string,
  params: unknown,
  opts: RequestOptions,
): Promise<unknown> {
  if (opts.sync) {
    return await denops.call(
      `luaeval`,
      `require("ddc_source_nvim_lsp.internal").request_sync(_A[1], _A[2], _A[3], _A[4])`,
      [
        opts.client.id,
        method,
        params,
        { timeout: opts.timeout, bufnr: opts.bufnr },
      ],
    );
  }

  const waiter = Promise.withResolvers();
  const lambda_id = register(
    denops,
    (res: unknown) => waiter.resolve(res),
    { once: true },
  );
  await denops.call(
    `luaeval`,
    `require("ddc_source_nvim_lsp.internal").request(_A[1], _A[2], _A[3], _A[4])`,
    [opts.client.id, method, params, {
      plugin_name: denops.name,
      lambda_id,
      bufnr: opts.bufnr,
    }],
  );
  return deadline(waiter.promise, opts.timeout);
}
