import { Heading as h } from "@tiptap/extension-heading";

export const Heading = h.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { $from, $to } = state.selection;
        if (
          state.selection.empty &&
          $from.parentOffset === 0 &&
          $from.parent.type.name === this.name
        ) {
          this.editor.commands.toggleNode(this.name, "paragraph");
          return true;
        }
        return false;
      },
    };
  },
});
