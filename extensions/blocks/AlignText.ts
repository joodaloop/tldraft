import { Extension } from "@tiptap/core";

export interface TextAlignOptions {
  /**
   * The types where legacy textAlign attrs are still accepted.
   * @default []
   */
  types: string[];
}

/**
 * Compatibility shim for old documents that contain `attrs.textAlign`.
 *
 * This intentionally preserves the schema attribute but does not render classes,
 * expose commands, or register keyboard shortcuts. Old docs keep loading; text
 * alignment no longer affects the editor.
 */
export const TextAlign = Extension.create<TextAlignOptions>({
  name: "textAlign",

  addOptions() {
    return {
      types: [],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: () => null,
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },
});
