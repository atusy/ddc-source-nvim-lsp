import { completionContext } from "./context.ts";

import { assertEquals } from "@std/assert/equals";

Deno.test("completionContext - a typed trigger character is reported as such", () => {
  assertEquals(
    completionContext([".", ":"], "call getbufline.", false),
    { triggerKind: 2, triggerCharacter: "." },
  );
});

Deno.test("completionContext - an ordinary keystroke is an invoked completion", () => {
  assertEquals(
    completionContext([".", ":"], "call getbufline", false),
    { triggerKind: 1 },
  );
  assertEquals(
    completionContext(undefined, "call getbufline.", false),
    { triggerKind: 1 },
  );
});

Deno.test("completionContext - re-querying an incomplete list says so", () => {
  assertEquals(
    completionContext([], "se", true),
    { triggerKind: 3 },
  );
});

Deno.test("completionContext - a trigger character wins over incompleteness", () => {
  // The server asked to be woken on ".", so tell it that is what happened.
  assertEquals(
    completionContext(["."], "getbufline.", true),
    { triggerKind: 2, triggerCharacter: "." },
  );
});

Deno.test("completionContext - an empty command line is an invoked completion", () => {
  assertEquals(completionContext(["."], "", false), { triggerKind: 1 });
});
