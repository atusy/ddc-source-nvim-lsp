import type { Client } from "./client.ts";
import { request } from "./request.ts";

import type { Denops } from "@denops/std";
import { assertEquals } from "@std/assert/equals";
import { assertRejects } from "@std/assert/rejects";

const client: Client = {
  id: 7,
  name: "test",
  provider: {},
  offsetEncoding: "utf-16",
};

function fakeDenops(
  start: { ok: boolean; request_id?: number; error?: string },
) {
  const dispatcher: Record<string, (...args: unknown[]) => unknown> = {};
  const cancelled: number[] = [];
  const denops = {
    name: "test",
    dispatcher,
    call: (_fn: string, expression: string, args: unknown[]) => {
      if (expression.includes("cancel_request")) {
        cancelled.push((args as [number, number])[1]);
        return Promise.resolve(true);
      }
      return Promise.resolve(start);
    },
  } as unknown as Denops;
  return { denops, dispatcher, cancelled };
}

Deno.test("request releases its callback after a successful response", async () => {
  const fake = fakeDenops({ ok: true, request_id: 42 });
  const pending = request(fake.denops, "textDocument/completion", {}, {
    client,
    timeout: 100,
    sync: false,
  });
  await Promise.resolve();
  const [callback] = Object.values(fake.dispatcher);
  await callback({ ok: true, result: ["item"] });

  assertEquals(await pending, ["item"]);
  assertEquals(Object.keys(fake.dispatcher), []);
  assertEquals(fake.cancelled, []);
});

Deno.test("request releases its callback when the client is missing", async () => {
  const fake = fakeDenops({ ok: false, error: "client missing" });

  await assertRejects(
    () =>
      request(fake.denops, "textDocument/completion", {}, {
        client,
        timeout: 100,
        sync: false,
      }),
    Error,
    "client missing",
  );
  assertEquals(Object.keys(fake.dispatcher), []);
});

Deno.test("request cancellation reaches Neovim and releases its callback", async () => {
  const fake = fakeDenops({ ok: true, request_id: 42 });
  const controller = new AbortController();
  const pending = request(fake.denops, "textDocument/completion", {}, {
    client,
    timeout: 100,
    sync: false,
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort();

  await assertRejects(() => pending, DOMException, "aborted");
  assertEquals(fake.cancelled, [42]);
  assertEquals(Object.keys(fake.dispatcher), []);
});

Deno.test("request timeout cancels Neovim and releases its callback", async () => {
  const fake = fakeDenops({ ok: true, request_id: 42 });

  await assertRejects(() =>
    request(fake.denops, "textDocument/completion", {}, {
      client,
      timeout: 1,
      sync: false,
    })
  );
  assertEquals(fake.cancelled, [42]);
  assertEquals(Object.keys(fake.dispatcher), []);
});
