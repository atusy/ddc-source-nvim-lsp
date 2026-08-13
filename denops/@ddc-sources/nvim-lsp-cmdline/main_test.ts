import {
  filterCompletionClients,
  resolveCompletePosition,
  Source,
} from "./main.ts";

import { assertEquals } from "@std/assert/equals";

const clients = [
  {
    id: 1,
    name: "kakehashi",
    offsetEncoding: "utf-16" as const,
    triggerCharacters: [],
  },
  {
    id: 2,
    name: "copilot",
    offsetEncoding: "utf-16" as const,
    triggerCharacters: [],
  },
];

Deno.test("cmdline server filters default to unrestricted null values", () => {
  const params = new Source().params();
  assertEquals(params.allowedServers, null);
  assertEquals(params.deniedServers, null);
});

Deno.test("cmdline completion position defaults to the keyword boundary", () => {
  const params = new Source().params();
  assertEquals(params.completePosition, "keyword");
  assertEquals(resolveCompletePosition("keyword", 4), 4);
});

Deno.test("cmdline completion can replace from the head", () => {
  assertEquals(resolveCompletePosition("head", 4), 0);
});

Deno.test("cmdline client filtering gives the deny list precedence", () => {
  assertEquals(
    filterCompletionClients(clients, ["kakehashi"], ["kakehashi"]),
    [],
  );
  assertEquals(
    filterCompletionClients(clients, ["kakehashi"], null),
    [clients[0]],
  );
});
