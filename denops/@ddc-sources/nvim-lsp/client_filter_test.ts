import { isClientAllowed } from "./client_filter.ts";

import { assertEquals } from "@std/assert/equals";

Deno.test("client filtering allows all names by default", () => {
  assertEquals(isClientAllowed("kakehashi", null, null), true);
});
