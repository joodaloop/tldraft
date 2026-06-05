import { Highlight as h } from "@tiptap/extension-highlight";

export const Highlight = h.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-h": () => this.editor.commands.toggleBlockquote(),
      "Mod-Shift-m": () => this.editor.commands.toggleBlockquote(),
    };
  },
});
