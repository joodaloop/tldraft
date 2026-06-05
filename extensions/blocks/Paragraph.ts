import { mergeAttributes, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

export interface ParagraphOptions {
  /**
   * The HTML attributes for a paragraph node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraph: {
      /**
       * Toggle a paragraph
       * @example editor.commands.toggleParagraph()
       */
      setParagraph: () => ReturnType;
      /**
       * Toggle the 'above' (kicker) style
       */
      toggleAbove: () => ReturnType;
      /**
       * Toggle the 'below' (subtitle) style
       */
      toggleBelow: () => ReturnType;
      /**
       * Toggle the 'small' style
       */
      toggleSmall: () => ReturnType;
    };
  }
}

/**
 * This extension allows you to create paragraphs.
 * @see https://www.tiptap.dev/api/nodes/paragraph
 */
export const Paragraph = Node.create<ParagraphOptions>({
  name: "paragraph",

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: "block",

  content: "inline*",

  addAttributes() {
    return {
      isSmall: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) => element.classList.contains("small"),
        renderHTML: (attributes) => {
          if (attributes.isSmall) {
            return {
              class: "small",
            };
          }
          return {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "p" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setParagraph:
        () =>
        ({ commands }) => {
          return commands.setNode(this.name);
        },
      toggleSmall:
        () =>
        ({ commands, editor }) => {
          const isCurrentlySmall = editor.isActive("paragraph", {
            isSmall: true,
          });

          return commands.updateAttributes("paragraph", {
            isSmall: !isCurrentlySmall,
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-0": () => this.editor.commands.setParagraph(),
      "Mod-0": () => this.editor.commands.unsetAllMarks(),
      "Mod-Shift-0": () => this.editor.commands.unsetAllMarks(),
      // "Mod-;": () => this.editor.commands.toggleSmall(),
      "Mod-Shift-a": ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;
        const { tr } = state;
        const { dispatch } = editor.view;

        tr.setSelection(
          TextSelection.create(tr.doc, $from.before() + 1, $from.after() - 1),
        );
        dispatch(tr);
        return true;
      },
    };
  },
});
