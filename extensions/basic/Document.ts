import { Node } from "@tiptap/core";

/**
 * The default document node which represents the top level node of the editor.
 * @see https://tiptap.dev/api/nodes/document
 */
export const Document = Node.create({
  name: "doc",
  topNode: true,
  content: "(block | root )+",
  renderMarkdown: (node, h) => {
    if (!node.content) {
      return "";
    }

    return h.renderChildren(node.content, "\n\n");
  },
  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        const { head, $from, $to } = editor.state.selection;
        if ($from.parentOffset != $to.parentOffset) {
          editor.chain().setTextSelection({ from: head, to: head }).run();
        } else {
          editor.commands.blur();
        }
        return false;
      },
    };
  },
});
