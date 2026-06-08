import {
  OrderedList as UpstreamOrderedList,
  type OrderedListOptions,
} from "@tiptap/extension-list/ordered-list";

export type { OrderedListOptions };

export const OrderedList = UpstreamOrderedList.extend<OrderedListOptions>({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Alt-7": () => this.editor.commands.toggleOrderedList(),
      "Mod-Shift-Alt-l": () => this.editor.commands.toggleOrderedList(),
    };
  },
});
