import { Extension } from "@tiptap/core";
import { collab } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

/**
 * Wraps the `@stepwisehq` collab-commit authority plugin as a Tiptap extension
 * so it lives inside the editor's plugin stack. The plugin tracks the synced
 * version + unconfirmed local steps; it's seeded by `initCollabState` once the
 * server sends its first snapshot (see `Doc.tsx`).
 */
export const Collab = Extension.create({
  name: "collab",
  addProseMirrorPlugins() {
    return [collab()];
  },
});
