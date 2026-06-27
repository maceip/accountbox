import { Extension, InputRule } from "@tiptap/core";

const TOKEN_RULE = /\{\{([a-zA-Z0-9_]+)\}\}$/;

/** Snippet editor only: typing `{{token}}` turns it into a fill-field chip
 *  ({{cursor}} stays text). */
export const SnippetTokenChips = Extension.create({
  name: "snippetTokenChips",
  addInputRules() {
    return [
      new InputRule({
        find: TOKEN_RULE,
        handler: ({ state, range, match }) => {
          const token = match[1].toLowerCase();
          if (token === "cursor") return;
          const node = state.schema.nodes.fillField?.create({ label: token });
          if (node) state.tr.replaceWith(range.from, range.to, node);
        },
      }),
    ];
  },
});
