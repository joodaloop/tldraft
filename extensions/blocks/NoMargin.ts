import { Extension, isNodeSelection } from "@tiptap/core";

export interface NoMarginOptions {
  /**
   * The node types where the 'noMargin' attribute can be applied.
   * @default []
   * @example ['heading', 'paragraph']
   */
  types: string[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noMargin: {
      /**
       * Toggle the 'above' (kicker) style on a node.
       * @example editor.commands.toggleAbove()
       */
      toggleAbove: () => ReturnType;
    };
  }
}

export const NoMargin = Extension.create<NoMarginOptions>({
  name: "noMargin",

  addOptions() {
    return {
      // Your "allow list" of nodes.
      types: [],
    };
  },

  addGlobalAttributes() {
    return [
      {
        // Apply these attributes to the node types listed in the options.
        types: this.options.types,

        attributes: {
          noMargin: {
            default: false,
            keepOnSplit: false,
            // We parse from the 'role' attribute for semantic HTML.
            parseHTML: (element) =>
              element.getAttribute("role") === "doc-kicker",
            // We render the 'class' and 'role' attributes.
            renderHTML: (attributes) => {
              if (attributes.noMargin) {
                return {
                  class: "above",
                  role: "doc-kicker",
                };
              }
              // Return an empty object if the attribute is not set.
              return {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      toggleAbove:
        () =>
        ({ editor, commands }) => {
          const { selection } = editor.state;
          let typeName;

          // ** NEW LOGIC: Check for a NodeSelection **
          // If a node is selected (like an <hr> or an image), and its type is in our allow list...
          if (
            isNodeSelection(selection) &&
            this.options.types.includes(selection.node.type.name)
          ) {
            // ...then we target that specific node.
            typeName = selection.node.type.name;
          } else {
            // ** OLD LOGIC: Fallback for TextSelection **
            // Otherwise, we get the type from the parent of the text cursor.
            typeName = editor.state.selection.$from.parent.type.name;
          }

          // Check if the determined node type is in our configured "allow list".
          if (!this.options.types.includes(typeName)) {
            // If not allowed, do nothing.
            return false;
          }

          // The rest of the logic is the same:
          // Check if the 'noMargin' attribute is currently active on the node.
          const isActive = editor.isActive({ noMargin: true });

          // Toggle the attribute by setting it to the opposite of its current state.
          return commands.updateAttributes(typeName, { noMargin: !isActive });
        },
    };
  },
});
