import {
  ListItem as UpstreamListItem,
  type ListItemOptions,
} from "@tiptap/extension-list/item";

export type { ListItemOptions };

export const ListItem = UpstreamListItem.extend<ListItemOptions>({
  content: "block+",
});
