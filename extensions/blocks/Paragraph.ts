import { mergeAttributes, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

const EMPTY_PARAGRAPH_MARKDOWN = "&nbsp;";
const NBSP_CHAR = "\u00A0";

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

  parseMarkdown: (token, helpers) => {
    const tokens = token.tokens || [];

    if (tokens.length === 1 && tokens[0].type === "image") {
      return helpers.parseChildren([tokens[0]]);
    }

    const content = helpers.parseInline(tokens);
    const hasExplicitEmptyParagraphMarker =
      tokens.length === 1 &&
      tokens[0].type === "text" &&
      (tokens[0].raw === EMPTY_PARAGRAPH_MARKDOWN ||
        tokens[0].text === EMPTY_PARAGRAPH_MARKDOWN ||
        tokens[0].raw === NBSP_CHAR ||
        tokens[0].text === NBSP_CHAR);

    if (
      hasExplicitEmptyParagraphMarker &&
      content.length === 1 &&
      content[0].type === "text" &&
      (content[0].text === EMPTY_PARAGRAPH_MARKDOWN ||
        content[0].text === NBSP_CHAR)
    ) {
      return helpers.createNode("paragraph", undefined, []);
    }

    return helpers.createNode("paragraph", undefined, content);
  },

  renderMarkdown: (node, h, ctx) => {
    if (!node) {
      return "";
    }

    const content = Array.isArray(node.content) ? node.content : [];

    if (content.length === 0) {
      const previousContent = Array.isArray(ctx?.previousNode?.content)
        ? ctx.previousNode.content
        : [];
      const previousNodeIsEmptyParagraph =
        ctx?.previousNode?.type === "paragraph" &&
        previousContent.length === 0;

      return previousNodeIsEmptyParagraph ? EMPTY_PARAGRAPH_MARKDOWN : "";
    }

    return h.renderChildren(content);
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
