import { Node, mergeAttributes } from "@tiptap/core";

export const ColumnContainer = Node.create({
  name: "flexContainer",
  group: "root",
  content: "flexColumn flexColumn",
  isolating: false,

  parseHTML() {
    return [
      {
        tag: 'div[class="split"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = {
      class: "split",
    };
    return ["div", mergeAttributes(HTMLAttributes, attrs), 0];
  },

  addCommands() {
    return {
      setFlexContainer:
        () =>
        ({ chain, editor }) => {
          if (editor.isActive(this.name)) {
            return false;
          }

          const insertPosition = editor.state.selection.from;
          return chain()
            .insertContent({
              type: this.name,

              content: [
                {
                  type: "flexColumn",
                  content: [{ type: "paragraph" }],
                },
                {
                  type: "flexColumn",
                  content: [{ type: "paragraph" }],
                },
              ],
            })
            .setTextSelection(insertPosition + 2) // +1 for <flexContainer>, +1 for <flexColumn>
            .run();
        },
    };
  },
});
