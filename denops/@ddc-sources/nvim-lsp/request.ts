import type { Client } from "./client.ts";

import type { Denops } from "@denops/std";
import * as lambda from "@denops/std/lambda";

import { deadline } from "@std/async/deadline";

type RequestOptions = {
  client: Client;
  timeout: number;
  sync: boolean;
  bufnr?: number;
  signal?: AbortSignal;
};

type RequestStart = {
  ok: boolean;
  request_id?: number;
  error?: string;
};

type RequestResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

function abortError(signal: AbortSignal): unknown {
  return signal.reason ??
    new DOMException("The request was aborted", "AbortError");
}

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

  const waiter = Promise.withResolvers<RequestResult>();
  const callback = lambda.add(denops, (res: unknown) => {
    waiter.resolve(res as RequestResult);
  });
  let requestId: number | undefined;
  let completed = false;
  let onAbort: (() => void) | undefined;

  const cancel = async () => {
    if (requestId === undefined) {
      return;
    }
    await denops.call(
      "luaeval",
      `require("ddc_source_nvim_lsp.internal").cancel_request(_A[1], _A[2])`,
      [opts.client.id, requestId],
    ).catch(() => {});
  };

  try {
    const start = await denops.call(
      "luaeval",
      `require("ddc_source_nvim_lsp.internal").request(_A[1], _A[2], _A[3], _A[4])`,
      [opts.client.id, method, params, {
        plugin_name: denops.name,
        lambda_id: callback.id,
        bufnr: opts.bufnr,
      }],
    ) as RequestStart;
    if (!start?.ok) {
      throw new Error(start?.error ?? "failed to start LSP request");
    }
    requestId = start.request_id;

    let response = deadline(waiter.promise, opts.timeout);
    if (opts.signal) {
      const aborted = Promise.withResolvers<never>();
      onAbort = () => aborted.reject(abortError(opts.signal!));
      opts.signal.addEventListener("abort", onAbort, { once: true });
      if (opts.signal.aborted) {
        onAbort();
      }
      response = Promise.race([response, aborted.promise]);
    }

    const result = await response;
    completed = true;
    if (!result?.ok) {
      throw new Error(result?.error ?? "LSP request failed");
    }
    return result.result;
  } finally {
    if (!completed) {
      await cancel();
    }
    if (opts.signal && onAbort) {
      opts.signal.removeEventListener("abort", onAbort);
    }
    callback.dispose();
  }
}
