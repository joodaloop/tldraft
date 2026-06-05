import { Blockquote as b } from "@tiptap/extension-blockquote";

export const Blockquote = b.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-'": () => this.editor.commands.toggleBlockquote(),
    };
  },
});
