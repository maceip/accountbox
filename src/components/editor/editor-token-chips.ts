import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { VARIABLE_KEYS } from "@/lib/snippet-tokens";

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export type TokenHit = { from: number; to: number; token: string };

/** The `{{token}}` range covering `pos` (caret inside or at its edge), or null. */
export function tokenAt(doc: PMNode, pos: number): TokenHit | null {
  let hit: TokenHit | null = null;
  doc.descendants((node, base) => {
    if (hit || !node.isText || !node.text) return;
    for (const m of node.text.matchAll(TOKEN_RE)) {
      const from = base + (m.index ?? 0);
      const to = from + m[0].length;
      if (pos > from && pos < to) hit = { from, to, token: m[1].toLowerCase() };
    }
  });
  return hit;
}

function chipClass(token: string): string {
  if (token === "cursor") return "token-chip token-chip--cursor";
  if (token === "date") return "token-chip token-chip--date";
  return VARIABLE_KEYS.has(token)
    ? "token-chip token-chip--var"
    : "token-chip token-chip--fill";
}

function build(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, base) => {
    if (!node.isText || !node.text) return;
    for (const m of node.text.matchAll(TOKEN_RE)) {
      const from = base + (m.index ?? 0);
      decos.push(
        Decoration.inline(from, from + m[0].length, {
          class: chipClass(m[1].toLowerCase()),
        }),
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

const key = new PluginKey("snippetTokenChips");

/** Snippet-editor only: paints `{{token}}` text as colored chips via decorations.
 *  The stored text stays `{{token}}`, so the composer's expansion is untouched. */
export const SnippetTokenChips = Extension.create({
  name: "snippetTokenChips",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});
