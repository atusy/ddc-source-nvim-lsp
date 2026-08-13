import {
  collectClientItems,
  convertCompletionItems,
  normalizeCompletionResult,
} from "./completion_result.ts";

import { assertEquals } from "@std/assert/equals";

Deno.test("normalizeCompletionResult rejects malformed lists", () => {
  assertEquals(normalizeCompletionResult(null), undefined);
  assertEquals(normalizeCompletionResult({ items: null }), undefined);
  assertEquals(normalizeCompletionResult({ isIncomplete: true }), undefined);
});

Deno.test("normalizeCompletionResult accepts arrays and lists", () => {
  const items = [{ label: "item" }];
  assertEquals(normalizeCompletionResult(items), {
    items,
    isIncomplete: false,
  });
  assertEquals(normalizeCompletionResult({ items, isIncomplete: true }), {
    items,
    isIncomplete: true,
    itemDefaults: undefined,
  });
});

Deno.test("collectClientItems retains a healthy client when another fails", async () => {
  const errors: unknown[] = [];
  const items = await collectClientItems([
    Promise.resolve(["healthy"]),
    Promise.reject(new Error("malformed server response")),
  ], (error) => {
    errors.push(error);
  });

  assertEquals(items, ["healthy"]);
  assertEquals(errors.length, 1);
});

Deno.test("convertCompletionItems isolates malformed elements", () => {
  const items = convertCompletionItems(
    [{ label: "healthy" }, null],
    (item) => (item as { label: string }).label.toUpperCase(),
  );
  assertEquals(items, ["HEALTHY"]);
});
