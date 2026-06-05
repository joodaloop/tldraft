import {
  Mark,
  markInputRule,
  markPasteRule,
  mergeAttributes,
} from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    rubricate: {
      /**
       * Set a strike mark
       * @example editor.commands.setStrike()
       */
      setRubrication: () => ReturnType;
      /**
       * Toggle a strike mark
       * @example editor.commands.toggleRubrication()
       */
      toggleRubrication: () => ReturnType;
      /**
       * Unset a strike mark
       * @example editor.commands.unsetRubrication()
       */
      unsetRubrication: () => ReturnType;
    };
  }
}

/**
 * Matches a strike to a ~~strike~~ on input.
 */
export const inputRegex =
  /(?:^|\s)(\+\+(?!\s+\+\+)((?:[^~]+))\+\+(?!\s+\+\+))$/;

/**
 * Matches a strike to a ~~strike~~ on paste.
 */
export const pasteRegex =
  /(?:^|\s)(\+\+(?!\s+\+\+)((?:[^~]+))\+\+(?!\s+\+\+))/g;

/**
 * This extension allows you to create strike text.
 * @see https://www.tiptap.dev/api/marks/strike
 */
export const Rubricate = Mark.create({
  name: "rubricate",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: "b",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "b",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setRubrication:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      toggleRubrication:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
      unsetRubrication:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-u": () => this.editor.commands.toggleRubrication(),
    };
  },

  addInputRules() {
    return [
      markInputRule({
        find: inputRegex,
        type: this.type,
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: pasteRegex,
        type: this.type,
      }),
    ];
  },
});
