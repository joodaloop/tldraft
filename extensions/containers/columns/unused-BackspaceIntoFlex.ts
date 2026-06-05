// FlexContainerBackspace.ts
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

export const FlexContainerBackspace = Extension.create({
  name: "flexContainerBackspace",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("flexContainerBackspace"),
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== "Backspace") {
              return false; // Not our key
            }

            const { state, dispatch } = view;
            const { selection } = state;
            const { $from, empty } = selection;

            // Only act when cursor is at the start of a block node
            if (
              !empty ||
              $from.parentOffset !== 0 ||
              $from.parent.type.name != "paragraph"
            ) {
              return false;
            }

            if ($from.before() == 0 && $from.parent.content.size == 0) {
              const tr = state.tr;
              tr.delete($from.before(), $from.after());
              dispatch(tr);
              return true;
            }

            // Resolve the position just before the current node
            const posBefore = $from.before();
            const nodeBefore = state.doc.resolve(posBefore).nodeBefore;

            // Check if the node before is our flexContainer
            if (nodeBefore?.type.name !== "flexContainer") {
              return false;
            }

            const lastColumn = nodeBefore.lastChild;
            const lastNodeInContainer = lastColumn?.lastChild;

            if (
              (lastNodeInContainer && lastNodeInContainer.content.size === 0) ||
              $from.parent.content.size == 0
            ) {
              console.log("Last node in flex container is empty.");
              return false;
            }

            const tr = state.tr;
            const paragraphToMove = $from.parent;

            // Position to insert into: end of the flexContainer's content
            // posBefore is the start of the current paragraph. posBefore - 1 is the closing tag of the flexContainer.
            // We want to insert just inside that, so the position is posBefore - 1.
            const insertPos = posBefore - 2;

            // 1. Delete the current paragraph
            tr.delete($from.before(), $from.after());

            // 2. Insert the (now deleted) paragraph at the end of the flexContainer
            tr.insert(insertPos, paragraphToMove);

            // 3. Set selection to the start of the moved paragraph
            // The new position is insertPos + 1 (for the opening <p> tag)
            tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));

            dispatch(tr);

            return true; // We handled the key press
          },
        },
      }),
    ];
  },
});
