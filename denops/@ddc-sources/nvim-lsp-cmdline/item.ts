import type { Item, PumHighlight } from "@shougo/ddc-vim/types";

import { type OffsetEncoding, toUtf16Index } from "./offset.ts";

type Position = { line: number; character: number };
type Range = { start: Position; end: Position };

/** LSP TextEdit or InsertReplaceEdit. */
export type TextEdit =
  | { range: Range; newText: string }
  | { insert: Range; replace: Range; newText: string };

export type LspCompletionItem = {
  label: string;
  insertText?: string;
  /** LSP InsertTextFormat: 1 = PlainText, 2 = Snippet. */
  insertTextFormat?: number;
  /** LSP CompletionItemKind: 1 = Text .. 25 = TypeParameter. */
  kind?: number;
  detail?: string;
  /** Where the server wants the text to go, which can start earlier than the
   * position ddc completes from. */
  textEdit?: TextEdit;
  /** newText for a textEdit built from itemDefaults.editRange. */
  textEditText?: string;
  /** Deprecated in LSP 3.15 in favour of tags, still sent by some servers. */
  deprecated?: boolean;
  /** LSP CompletionItemTag: 1 = Deprecated. */
  tags?: number[];
};

export type CompletionResult =
  | LspCompletionItem[]
  | {
    items?: LspCompletionItem[] | null;
    isIncomplete?: boolean;
    /** Per the LSP spec, itemDefaults applies to every item in the list that
     * doesn't specify its own -- servers use this instead of repeating the
     * same value on every item. */
    itemDefaults?: {
      insertTextFormat?: number;
      editRange?: Range | { insert: Range; replace: Range };
    };
  }
  | null
  | undefined;

function isPosition(value: unknown): value is Position {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { line, character } = value as Record<string, unknown>;
  return typeof line === "number" && typeof character === "number";
}

function isRange(value: unknown): value is Range {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { start, end } = value as Record<string, unknown>;
  return isPosition(start) && isPosition(end);
}

function sanitizeTextEdit(value: unknown): TextEdit | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { range, insert, replace, newText } = value as Record<string, unknown>;
  if (typeof newText !== "string") {
    return null;
  }
  if (isRange(range)) {
    return { range, newText };
  }
  if (isRange(insert) && isRange(replace)) {
    return { insert, replace, newText };
  }
  return null;
}

type ItemDefaults = {
  insertTextFormat?: number;
  editRange?: Range | { insert: Range; replace: Range };
};

/** Turns itemDefaults.editRange into the textEdit the item would have carried
 * itself, so everything downstream only has to know about `textEdit`. */
function textEditFromDefaults(
  editRange: ItemDefaults["editRange"],
  newText: string,
): TextEdit | null {
  if (isRange(editRange)) {
    return { range: editRange, newText };
  }
  if (typeof editRange !== "object" || editRange === null) {
    return null;
  }
  const { insert, replace } = editRange as Record<string, unknown>;
  if (isRange(insert) && isRange(replace)) {
    return { insert, replace, newText };
  }
  return null;
}

/** Validates `label` and drops any optional field with the wrong type,
 * rather than letting e.g. a numeric `insertText` become a ddc item's
 * `word` (ddc's matchers expect strings). Returns null for anything
 * without a usable string `label`. `defaults` fills in for an item that
 * omits its own (see CompletionResult.itemDefaults above). */
function sanitizeItem(
  item: unknown,
  defaults?: ItemDefaults,
): LspCompletionItem | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const {
    label,
    insertText,
    kind,
    detail,
    insertTextFormat,
    textEdit,
    textEditText,
    deprecated,
    tags,
  } = item as Record<string, unknown>;
  if (typeof label !== "string") {
    return null;
  }
  const resolvedInsertTextFormat = typeof insertTextFormat === "number"
    ? insertTextFormat
    : defaults?.insertTextFormat;
  const resolvedTextEditText = typeof textEditText === "string"
    ? textEditText
    : undefined;
  const resolvedTextEdit = sanitizeTextEdit(textEdit) ??
    textEditFromDefaults(defaults?.editRange, resolvedTextEditText ?? label);
  return {
    label,
    ...(typeof insertText === "string" && { insertText }),
    ...(typeof kind === "number" && { kind }),
    ...(typeof detail === "string" && { detail }),
    ...(typeof resolvedInsertTextFormat === "number" && {
      insertTextFormat: resolvedInsertTextFormat,
    }),
    ...(resolvedTextEditText !== undefined && {
      textEditText: resolvedTextEditText,
    }),
    ...(resolvedTextEdit !== null && { textEdit: resolvedTextEdit }),
    ...(typeof deprecated === "boolean" && { deprecated }),
    ...(Array.isArray(tags) && {
      tags: tags.filter((tag) => typeof tag === "number"),
    }),
  };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

/** Whether the server wants to be asked again as the prefix grows: an
 * incomplete list is a snapshot, not the full answer. */
export function isIncompleteResult(result: CompletionResult): boolean {
  return !!result && !Array.isArray(result) && result.isIncomplete === true;
}

/** Normalizes a textDocument/completion response into an item array,
 * tolerating a missing/malformed `items` field or elements on the
 * CompletionList shape -- one bad element no longer drops every item. */
export function normalizeCompletionResult(
  result: CompletionResult,
): LspCompletionItem[] {
  if (!result) {
    return [];
  }
  const items = Array.isArray(result) ? result : result.items;
  if (!Array.isArray(items)) {
    return [];
  }
  const defaults = Array.isArray(result) ? undefined : result.itemDefaults;
  return items
    .map((item) => sanitizeItem(item, defaults))
    .filter(isPresent);
}

const INSERT_TEXT_FORMAT_SNIPPET = 2;

/** LSP CompletionItemKind names, as ddc-source-lsp displays them. */
const COMPLETION_ITEM_KIND: Record<number, string> = {
  1: "Text",
  2: "Method",
  3: "Function",
  4: "Constructor",
  5: "Field",
  6: "Variable",
  7: "Class",
  8: "Interface",
  9: "Module",
  10: "Property",
  11: "Unit",
  12: "Value",
  13: "Enum",
  14: "Keyword",
  15: "Snippet",
  16: "Color",
  17: "File",
  18: "Reference",
  19: "Folder",
  20: "EnumMember",
  21: "Constant",
  22: "Struct",
  23: "Event",
  24: "Operator",
  25: "TypeParameter",
};

const COMPLETION_ITEM_KIND_TEXT = 1;

export type ItemContext = {
  /** The whole command line: the single line of the document the server saw,
   * and what a textEdit's character offsets index into. */
  line: string;
  /** Index in `line` where ddc splices the word in (its completePos). */
  suggestCharacter: number;
  /** positionEncoding of the client that produced the item. */
  offsetEncoding: OffsetEncoding;
  enableDisplayDetail?: boolean;
  enableMatchLabel?: boolean;
};

function editRangeOf(textEdit: TextEdit): Range {
  // Of an InsertReplaceEdit, take the insert range: it stops at the cursor
  // instead of swallowing the text after it, which is the behaviour ddc's
  // insert-at-completePos model can reproduce.
  return "range" in textEdit ? textEdit.range : textEdit.insert;
}

/** Index in `line` the server would start writing at, or ctx.suggestCharacter
 * for an item without a textEdit. Leading whitespace in the range is skipped,
 * as ddc-source-lsp does: some servers hand back a range starting a word
 * early. */
function startIndexOf(lspItem: LspCompletionItem, ctx: ItemContext): number {
  if (!lspItem.textEdit) {
    return ctx.suggestCharacter;
  }
  const { start } = editRangeOf(lspItem.textEdit);
  const index = toUtf16Index(ctx.line, start.character, ctx.offsetEncoding);
  const delta = ctx.line.slice(index, ctx.suggestCharacter).search(/\S/);
  return index + (delta > 0 ? delta : 0);
}

/** ddc inserts from its own completePos, so an item whose edit starts earlier
 * has to hand back only the remainder -- otherwise ":call s:fu" completed with
 * "s:func" would confirm as ":call s:s:func". */
function toWord(
  lspItem: LspCompletionItem,
  text: string,
  ctx: ItemContext,
): string {
  let start = startIndexOf(lspItem, ctx);
  if (start < ctx.suggestCharacter) {
    // The text has to continue what the line already holds; when it doesn't,
    // splicing it in would corrupt the line, so ignore the edit's start.
    const prefix = ctx.line.slice(start, ctx.suggestCharacter);
    if (!text.startsWith(prefix)) {
      start = ctx.suggestCharacter;
    }
  }
  return (ctx.line.slice(0, start) + text).slice(ctx.suggestCharacter);
}

/** The label without the decorators servers add for display (a bullet, or
 * alignment padding), leaving what should also appear in the inserted text. */
function pureLabel(label: string): string {
  return label.replace(/^[•\s]+|[•\s]+$/g, "");
}

const COMPLETION_ITEM_TAG_DEPRECATED = 1;

function isDeprecated(lspItem: LspCompletionItem): boolean {
  return lspItem.deprecated === true ||
    !!lspItem.tags?.includes(COMPLETION_ITEM_TAG_DEPRECATED);
}

const ENCODER = new TextEncoder();

/** Strike the whole label through, as ddc-source-lsp does. `width` is in
 * bytes: pum.vim places highlights by byte column. */
function deprecatedHighlights(lspItem: LspCompletionItem): PumHighlight[] {
  return [{
    type: "abbr",
    // NOTE: the name only matters to Vim, where highlights are named matches.
    name: "ddc-source-nvim-lsp-deprecated",
    hl_group: "DdcLspCmdlineDeprecated",
    col: 1,
    width: ENCODER.encode(lspItem.label).length,
  }];
}

/** Returns null for an item that cannot be applied to the command line: the
 * document is one line, so an edit touching any other line is unusable. */
export function toItem(
  lspItem: LspCompletionItem,
  ctx: ItemContext,
): Item | null {
  if (lspItem.textEdit) {
    const { start, end } = editRangeOf(lspItem.textEdit);
    if (start.line !== 0 || end.line !== 0) {
      return null;
    }
  }
  // A snippet's insertText (e.g. "getbufline(${1:buf})") isn't valid text to
  // drop into the command line as-is; fall back to the plain label rather
  // than inserting literal placeholder syntax.
  // The label is display text and may be padded or decorated; trim it, as
  // ddc-source-lsp does, before it becomes inserted text.
  // NOTE: a textEdit contributes its range here, not its newText, which may
  // be a snippet -- and nothing in the cmdline expands one.
  const text = lspItem.insertTextFormat === INSERT_TEXT_FORMAT_SNIPPET
    ? lspItem.label.trim()
    : lspItem.insertText ?? lspItem.label.trim();
  const word = toWord(lspItem, text, ctx);
  if (ctx.enableMatchLabel && !word.includes(pureLabel(lspItem.label))) {
    return null;
  }
  return {
    word,
    abbr: lspItem.label,
    // Same split as ddc-source-lsp: the kind column names the
    // CompletionItemKind (defaulting to Text, as the LSP spec does not),
    // and `detail` -- free-form server text such as a signature -- goes to
    // the menu column. An unknown kind number leaves the column blank, which
    // is what ddc does with the undefined ddc-source-lsp hands it.
    kind: COMPLETION_ITEM_KIND[lspItem.kind ?? COMPLETION_ITEM_KIND_TEXT] ?? "",
    menu: ctx.enableDisplayDetail ? lspItem.detail ?? "" : "",
    ...(isDeprecated(lspItem) && { highlights: deprecatedHighlights(lspItem) }),
  };
}
