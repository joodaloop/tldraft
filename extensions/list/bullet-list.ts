import {
  BulletList as UpstreamBulletList,
  type BulletListOptions,
} from "@tiptap/extension-list/bullet-list";

export type { BulletListOptions };

export const BulletList = UpstreamBulletList.extend<BulletListOptions>({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Alt-8": () => this.editor.commands.toggleBulletList(),
      "Mod-Alt-l": () => this.editor.commands.toggleBulletList(),
    };
  },
});
