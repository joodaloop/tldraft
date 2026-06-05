import { Extension } from "@tiptap/core";

export interface TextAlignOptions {
  /**
   * The types where the text align attribute can be applied.
   * @default []
   * @example ['heading', 'paragraph']
   */
  types: string[];

  /**
   * The alignments which are allowed.
   * @default ['left', 'center', 'right', 'justify']
   * @example ['left', 'right']
   */
  alignments: string[];

  /**
   * The default alignment.
   * @default null
   * @example 'center'
   */
  defaultAlignment: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textAlign: {
      /**
       * Set the text align attribute
       * @param alignment The alignment
       * @example editor.commands.setTextAlign('left')
       */
      setTextAlign: (alignment: string) => ReturnType;
      /**
       * Unset the text align attribute
       * @example editor.commands.unsetTextAlign()
       */
      unsetTextAlign: () => ReturnType;
      /**
       * Toggle the text align attribute
       * @param alignment The alignment
       * @example editor.commands.toggleTextAlign('right')
       */
      toggleTextAlign: (alignment: string) => ReturnType;
    };
  }
}

/**
 * This extension allows you to align text.
 * @see https://www.tiptap.dev/api/extensions/text-align
 */
export const TextAlign = Extension.create<TextAlignOptions>({
  name: "textAlign",

  addOptions() {
    return {
      types: [],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: null,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: null,

            // --- CHANGE HERE ---
            // Instead of parsing the style attribute, we look for a class.
            parseHTML: (element) => {
              const found = this.options.alignments.find((alignment) =>
                element.classList.contains(`align-${alignment}`),
              );
              // 2. Return null if not found
              return found || null;
            },

            // --- AND CHANGE HERE ---
            // Instead of rendering an inline style, we render a class.
            renderHTML: (attributes) => {
              if (!attributes.textAlign) {
                return {}; // Return nothing if no alignment is set
              }

              // Return an object with a class attribute
              return {
                class: `align-${attributes.textAlign}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign:
        (alignment: string) =>
        ({ commands }) => {
          if (!this.options.alignments.includes(alignment)) {
            return false;
          }

          return this.options.types
            .map((type) =>
              commands.updateAttributes(type, { textAlign: alignment }),
            )
            .every((response) => response);
        },

      unsetTextAlign:
        () =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.updateAttributes(type, { textAlign: null }))
            .every((response) => response);
        },

      toggleTextAlign:
        (alignment) =>
        ({ editor, commands }) => {
          if (!this.options.alignments.includes(alignment)) {
            return false;
          }

          if (editor.isActive({ textAlign: alignment })) {
            return commands.unsetTextAlign();
          }
          return commands.setTextAlign(alignment);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-Shift-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-Shift-r": () => this.editor.commands.setTextAlign("right"),
      "Mod-Shift-j": () => this.editor.commands.setTextAlign("justify"),
    };
  },
});
