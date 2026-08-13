import {
  clientTimeout,
  completionMetadata,
  filterCompletionClients,
  helpPreview,
  remainingTimeout,
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
  assertEquals(params.enableHelpPreview, false);
});

Deno.test("cmdline completion position defaults to the keyword boundary", () => {
  const params = new Source().params();
  assertEquals(params.completePosition, "keyword");
  assertEquals(resolveCompletePosition("keyword", 4), 4);
});

Deno.test("cmdline completion can replace from the head", () => {
  assertEquals(resolveCompletePosition("head", 4), 0);
});

Deno.test("cmdline request metadata captures its immutable generation", () => {
  assertEquals(completionMetadata(3, ":", "command", 5), {
    generation: 3,
    cmdType: ":",
    completionType: "command",
    completePos: 5,
  });
});

Deno.test("help preview opens only an existing help tag", () => {
  assertEquals(helpPreview("lua-guide", ["lua-guide"]), {
    kind: "help",
    tag: "lua-guide",
  });
  assertEquals(helpPreview("missing", []), { kind: "empty" });
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

Deno.test("multiple cmdline clients share one timeout budget", () => {
  assertEquals(remainingTimeout(2_000, 1_250), 750);
  assertEquals(remainingTimeout(2_000, 2_500), 0);
  assertEquals(clientTimeout(750, 3), 250);
  assertEquals(clientTimeout(1, 3), 1);
});
