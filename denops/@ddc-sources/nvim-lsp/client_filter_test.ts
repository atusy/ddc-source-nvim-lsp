import { isClientAllowed } from "./client_filter.ts";

import { assertEquals } from "@std/assert/equals";

Deno.test("client filtering allows all names by default", () => {
  assertEquals(isClientAllowed("kakehashi", null, null), true);
});

Deno.test("client filtering restricts names to the allow list", () => {
  assertEquals(isClientAllowed("kakehashi", ["kakehashi"], null), true);
  assertEquals(isClientAllowed("copilot", ["kakehashi"], null), false);
  assertEquals(isClientAllowed("kakehashi", [], null), false);
});

Deno.test("client filtering gives the deny list precedence", () => {
  assertEquals(isClientAllowed("kakehashi", null, ["kakehashi"]), false);
  assertEquals(
    isClientAllowed("kakehashi", ["kakehashi"], ["kakehashi"]),
    false,
  );
  assertEquals(isClientAllowed("kakehashi", ["kakehashi"], []), true);
});
