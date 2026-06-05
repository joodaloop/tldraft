// Column.js
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const ColumnExtension = Node.create({
  // 1. A unique name for the node
  name: "column",

  // 2. Define the group this node belongs to
  group: "root",

  // 3. Define what content this node can hold. 'block+' means one or more block nodes.
  content: "(block | rootOrCol)+",

  // 4. This node is a "defining" node. This prevents, for example,
  // two adjacent column nodes from being merged together.
  defining: true,
  selectable: true,
  // draggable: true,

  // 5. Define the attributes for this node
  addAttributes() {
    return {
      width: {
        default: "1_2", // Default width
        // This is the crucial part: render the 'width' attribute as a class
        renderHTML: (attributes) => {
          // The request is to have the class be "1_2", "1_3", etc.
          return {
            class: "col span-" + attributes.width,
            // We also add a data-attribute for more robust parsing
            "data-column-width": attributes.width,
          };
        },
        // And parse it from the data-attribute when loading content
        parseHTML: (element) => element.getAttribute("data-column-width"),
      },
    };
  },

  // 6. How to parse this node from HTML
  parseHTML() {
    return [
      {
        // Matches any div with the 'data-column-width' attribute
        tag: "div[data-column-width]",
      },
    ];
  },

  // 7. How to render this node to HTML
  renderHTML({ HTMLAttributes }) {
    // The `mergeAttributes` helper will combine the rendered attributes
    // from `addAttributes` with any other attributes.
    // The '0' represents the hole where the content will be rendered.
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },

  addProseMirrorPlugins() {
    return [
      // Use the aliased name here
      new Plugin({
        key: new PluginKey("columnActive"),
        props: {
          decorations: (state) => {
            const decorations = [];
            const { doc, selection } = state;

            doc.descendants((node, pos) => {
              if (node.type.name !== this.name) {
                return;
              }
              const isSelected =
                selection.from > pos && selection.to < pos + node.nodeSize;
              if (isSelected) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "is-active",
                  }),
                );
              }
            });
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },

  // 8. Add the commands that can be chained from the editor instance
  addCommands() {
    return {
      /**
       * Sets the node around the selection to be a column.
       * If it's already a column, it updates the width attribute.
       */
      setColumn:
        (attributes) =>
        ({ commands, state }) => {
          // We use $from.node(-1) to get the parent node of the selection.
          const parent = state.selection.$from.node(-1);

          // Check if the parent node is already a column
          if (parent && parent.type.name === this.name) {
            // If yes, just update its width attribute
            return commands.updateAttributes(this.name, attributes);
          } else {
            // If not, wrap the current selection in a new column node
            return commands.wrapIn(this.name, attributes);
          }
        },
      /**
       * Lifts the content out of the column, effectively removing the wrap.
       */
      unsetColumn:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        //   const { selection } = this.editor.state;
        //   // Case 1: Is the cursor at the start of the column? If so, lift.
        //   if (isCursorAtStartOfNode(selection, this.name)) {
        //     return this.editor.commands.lift(this.name);
        //   }
        //   // Case 2: Is the entire column content selected? If so, clear it.
        //   if (
        //     !selection.empty &&
        //     isAllContentOfNodeSelected(selection, this.name)
        //   ) {
        //     return this.editor.commands.clearNodes();
        //   }
        //   return false;
        // },
        // Delete: () => {
        //   const { selection } = this.editor.state;
        //   if (isAllContentOfNodeSelected(selection, this.name)) {
        //     return this.editor.commands.clearNodes();
        //   }
        //   return false;
      },
    };
  },
});

export default ColumnExtension;
