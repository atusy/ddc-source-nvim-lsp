import type { LSP } from "./deps/lsp.ts";

export type NormalizedCompletionResult = {
  items: LSP.CompletionItem[];
  isIncomplete: boolean;
  itemDefaults?: LSP.CompletionList["itemDefaults"];
};

export function normalizeCompletionResult(
  result: unknown,
): NormalizedCompletionResult | undefined {
  if (Array.isArray(result)) {
    return { items: result as LSP.CompletionItem[], isIncomplete: false };
  }
  if (typeof result !== "object" || result === null || !("items" in result)) {
    return;
  }
  const list = result as Record<string, unknown>;
  if (!Array.isArray(list.items)) {
    return;
  }
  return {
    items: list.items as LSP.CompletionItem[],
    isIncomplete: list.isIncomplete === true,
    itemDefaults: list.itemDefaults as LSP.CompletionList["itemDefaults"],
  };
}

export async function collectClientItems<T>(
  tasks: Promise<T[]>[],
  onError: (error: unknown) => void | Promise<void>,
): Promise<T[]> {
  const results = await Promise.all(tasks.map(async (task) => {
    try {
      return await task;
    } catch (error) {
      try {
        await onError(error);
      } catch {
        // Error reporting must not suppress results from healthy clients.
      }
      return [];
    }
  }));
  return results.flat();
}
