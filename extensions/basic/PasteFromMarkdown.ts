import { Extension, type Content, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const clipboardHasHtml = (clipboardData: DataTransfer) => {
  return clipboardData.types.includes("text/html");
};

const contentForInsertion = (content: JSONContent): Content => {
  if (content.type === "doc" && Array.isArray(content.content)) {
    return content.content;
  }

  return content;
};

/**
 * Converts plaintext-only clipboard payloads from Markdown before insertion.
 */
export const PasteFromMarkdown = Extension.create({
  name: "pasteFromMarkdown",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("pasteFromMarkdown"),
        props: {
          handlePaste: (_view, event) => {
            const { clipboardData } = event;

            if (!clipboardData || clipboardHasHtml(clipboardData)) {
              return false;
            }

            const text = clipboardData.getData("text/plain");

            if (!text || !this.editor.markdown) {
              return false;
            }

            try {
              const content = this.editor.markdown.parse(text);

              return this.editor.commands.insertContent(
                contentForInsertion(content),
              );
            } catch {
              return false;
            }
          },
        },
      }),
    ];
  },
});
