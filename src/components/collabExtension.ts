import { Extension } from "@tiptap/core";
import {
  collab,
  receiveCommitTransaction,
  type Commit,
} from "@stepwisehq/prosemirror-collab-commit/collab-commit";
import type { EditorState, Transaction } from "prosemirror-state";

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

/**
 * Apply an incoming remote commit while keeping the local text selection biased
 * before inserted content at the same position. This prevents a co-located
 * remote cursor from being carried forward when another user types or presses
 * Enter at that spot.
 */
export function receiveRemoteCommitTransaction(
  state: EditorState,
  commit: Commit,
): Transaction {
  return receiveCommitTransaction(state, commit, { mapSelectionBackward: true });
}
