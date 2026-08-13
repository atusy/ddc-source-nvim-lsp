/** LSP CompletionTriggerKind. */
const INVOKED = 1;
const TRIGGER_CHARACTER = 2;
const TRIGGER_FOR_INCOMPLETE_COMPLETIONS = 3;

export type CompletionContext = {
  triggerKind: number;
  triggerCharacter?: string;
};

/**
 * Describe why completion is being requested, as ddc-source-lsp does.
 * Servers answer differently per trigger kind: a server that registered "."
 * as a trigger character may only return members when told the "." is what
 * woke it, and one that returned an incomplete list needs to know a later
 * request is a re-query of that list rather than a fresh completion.
 *
 * `input` is the command line before the cursor; its last character is the
 * keystroke that triggered this request.
 */
export function completionContext(
  triggerCharacters: string[] | undefined,
  input: string,
  isIncomplete: boolean,
): CompletionContext {
  const trigger = input.slice(-1);
  if (trigger !== "" && triggerCharacters?.includes(trigger)) {
    return { triggerKind: TRIGGER_CHARACTER, triggerCharacter: trigger };
  }
  return {
    triggerKind: isIncomplete ? TRIGGER_FOR_INCOMPLETE_COMPLETIONS : INVOKED,
  };
}
