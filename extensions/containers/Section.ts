/** @jsxImportSource @tiptap/core */
import { mergeAttributes, Node, wrappingInputRule } from "@tiptap/core";

export interface sectionOptions {
  /**
   * HTML attributes to add to the blockquote element
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    section: {
      /**
       * Set a blockquote node
       */
      setSection: () => ReturnType;
      /**
       * Toggle a blockquote node
       */
      toggleSection: () => ReturnType;
      /**
       * Unset a blockquote node
       */
      unsetSection: () => ReturnType;
    };
  }
}

/**
 * Matches a blockquote to a `>` as input.
 */
export const inputRegex = /^\s*(!|\])\s$/;

/**
 * This extension allows you to create blockquotes.
 * @see https://tiptap.dev/api/nodes/blockquote
 */
export const Section = Node.create<sectionOptions>({
  name: "section",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  content: "block+",

  group: "block",

  defining: true,
  draggable: true,

  addAttributes() {
    return {
      role: {
        default: "note",
        renderHTML: () => {
          return {
            role: "note",
            "aria-roledescription": "callout",
          };
        },
        parseHTML: (element) => element.getAttribute("aria-roledescription"),
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[role='note']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setSection:
        () =>
        ({ commands }) => {
          return commands.wrapIn(this.name);
        },
      toggleSection:
        () =>
        ({ commands }) => {
          return commands.toggleWrap(this.name);
        },
      unsetSection:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-]": () => this.editor.commands.toggleSection(),
    };
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: inputRegex,
        type: this.type,
      }),
    ];
  },
});
