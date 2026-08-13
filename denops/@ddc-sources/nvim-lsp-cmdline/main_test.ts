import { filterCompletionClients, Source } from "./main.ts";

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
