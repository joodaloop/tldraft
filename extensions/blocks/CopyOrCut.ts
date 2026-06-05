import { Extension } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { Slice, Fragment } from "prosemirror-model";

export const CopyOrCutWithEmptySelection = Extension.create({
  name: "CopyOrCutWithEmpltySelection",

  addKeyboardShortcuts() {
    const handleCopyOrCut =
      (cut = false) =>
      () => {
        const { editor } = this;
        const { state, view } = editor;
        const { selection, tr } = state;

        if (!selection.empty) {
          return false;
        }

        const { $from } = selection;

        if ($from.depth === 0) {
          return false;
        }

        const nodePos = $from.before($from.depth);
        const nodeToCopy = $from.parent;

        let slice = new Slice(Fragment.from(nodeToCopy), 0, 0);

        if (nodeToCopy.content.size > 0) {
          slice = new Slice(nodeToCopy.content, 1, 1);
        } else {
          // For empty nodes, use the original "closed" slice method.
          slice = new Slice(Fragment.from(nodeToCopy), 0, 0);
        }

        const { dom, text } = view.serializeForClipboard(slice);

        navigator.clipboard
          .write([
            new ClipboardItem({
              "text/html": new Blob([dom.innerHTML], { type: "text/html" }),
              "text/plain": new Blob([text], { type: "text/plain" }),
            }),
          ])
          .catch((err) => {
            console.error("Failed to copy/cut node to clipboard:", err);
          });

        // 5. If this is a cut operation, delete the node.
        // if (cut) {
        //   tr.delete(nodePos, nodePos + nodeToCopy.nodeSize);
        //   view.dispatch(tr);
        // }

        if (cut) {
          // --- REVISED CUT LOGIC ---
          if (nodePos === 0) {
            // If it's the *only* node, replace it with an empty paragraph.
            if (state.doc.content.childCount === 1) {
              const type = state.schema.nodes.paragraph;
              if (!type) return false;

              tr.delete(0, state.doc.content.size).insert(0, type.create());

              tr.setSelection(TextSelection.create(tr.doc, 1));
            } else {
              // If it's the first of many, just delete it.
              // The cursor will correctly fall to the start of the next node.
              tr.delete(nodePos, nodePos + nodeToCopy.nodeSize);
            }
          } else {
            // Normal case: Cutting a node that is not the first.
            tr.delete(nodePos, nodePos + nodeToCopy.nodeSize);

            // Find the closest valid cursor position *backwards* from the cut point.
            const selectionAfter = Selection.near(tr.doc.resolve(nodePos), -1);
            if (selectionAfter) {
              tr.setSelection(selectionAfter);
            }
          }

          view.dispatch(tr);
        }

        // 6. Prevent default.
        return true;
      };

    return {
      "Mod-c": handleCopyOrCut(false),
      // "Mod-x": handleCopyOrCut(true),
    };
  },
});
