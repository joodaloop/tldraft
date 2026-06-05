import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * An extension that allows selecting all text within a node by
 * holding Cmd (or Ctrl) and clicking on it.
 */
export const SelectNodeOnClick = Extension.create({
  name: "selectNodeOnClick",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("selectNodeOnClick"),
        props: {
          // Listen for mousedown events on the editor
          handleDOMEvents: {
            click: (view: EditorView, event: MouseEvent) => {
              // Only proceed if the Cmd (Mac) or Ctrl (Windows/Linux) key is pressed.
              // We check both metaKey and ctrlKey for cross-platform compatibility.
              if (!event.altKey) {
                // Let ProseMirror handle the event as usual
                return false;
              }

              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });

              // If the click is not within the editor's content area, do nothing.
              if (!pos) {
                return false;
              }

              const { state } = view;
              const { tr } = state;

              // Resolve the document position from the click
              const $pos = state.doc.resolve(pos.pos);

              // Iterate up the node tree from the click position
              for (let i = $pos.depth; i > 0; i--) {
                const node = $pos.node(i);

                // We are looking for a block-level node to select.
                // We skip text nodes and inline nodes.
                if (node.isBlock) {
                  // Calculate the start and end positions of the node's content.
                  // $pos.before(i) gives the position just before the node starts.
                  const nodeStartPos = $pos.before(i);
                  // The content starts 1 position after the node's opening tag.
                  const selectionStart = nodeStartPos + 1;
                  // The content ends 1 position before the node's closing tag.
                  const selectionEnd = nodeStartPos + node.content.size + 1;

                  // Create a new TextSelection for the node's content.
                  const selection = TextSelection.create(
                    tr.doc,
                    selectionStart,
                    selectionEnd,
                  );

                  // Apply the new selection to the document.
                  tr.setSelection(selection);
                  view.dispatch(tr);

                  // We have handled the event, so we return true to prevent
                  // ProseMirror's default click behavior (moving the cursor).
                  return true;
                }
              }

              // If no suitable block node was found, let ProseMirror handle it.
              return false;
            },
          },
        },
      }),
    ];
  },
});
