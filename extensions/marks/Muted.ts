import {
  Mark,
  markInputRule,
  markPasteRule,
  mergeAttributes,
} from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    muted: {
      /**
       * Set a strike mark
       * @example editor.commands.setStrike()
       */
      setMuted: () => ReturnType;
      /**
       * Toggle a strike mark
       * @example editor.commands.toggleMuted()
       */
      toggleMuted: () => ReturnType;
      /**
       * Unset a strike mark
       * @example editor.commands.unsetMuted()
       */
      unsetMuted: () => ReturnType;
    };
  }
}

/**
 * Matches a strike to a ~~strike~~ on input.
 */
export const inputRegex = /(?:^|\s)(::(?!\s+::)((?:[^~]+))::(?!\s+::))$/;

/**
 * Matches a strike to a ~~strike~~ on paste.
 */
export const pasteRegex = /(?:^|\s)(::(?!\s+::)((?:[^~]+))::(?!\s+::))/g;

/**
 * This extension allows you to create strike text.
 * @see https://www.tiptap.dev/api/marks/strike
 */
export const Muted = Mark.create({
  name: "muted",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: "i",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "i",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setMuted:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      toggleMuted:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
      unsetMuted:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-j": () => this.editor.commands.toggleMuted(),
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
