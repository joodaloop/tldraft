import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection, Selection, Plugin, PluginKey } from "@tiptap/pm/state";
import { handleBackspace } from "./Backspace";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const Column = Node.create({
  name: "flexColumn",
  group: "flexColumn",
  content: "block+",
  isolating: false,
  selectable: false,

  addOptions() {
    return {
      focusClass: "has-focus",
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="flex-column"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "flex-column" }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    return [
      // This plugin now only has one job: provide decorations based on selection.
      new Plugin({
        key: new PluginKey("columnFocusDecoration"), // Give it a unique key
        props: {
          decorations: (state) => {
            // No more state checking, just the raw, correct logic.
            const decorations: Decoration[] = [];
            const { doc, selection } = state;
            const { $from } = selection;

            // This is the same robust logic from Snippet 1
            for (let i = $from.depth; i > 0; i--) {
              const node = $from.node(i);
              if (node.type.name === this.name) {
                const from = $from.start(i);
                const to = from + node.nodeSize;

                decorations.push(
                  Decoration.node(from, to, {
                    class: this.options.focusClass,
                  }),
                );
                break;
              }
            }

            if (decorations.length === 0) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        const { $from } = selection;
        const col = $from.node(-1);
        const container = $from.node(-2);

        if (
          container?.type.name === "flexContainer" &&
          col === container.lastChild &&
          $from.parent.content.size === 0
        ) {
          const posAfter = $from.after(-2);
          const type = state.schema.nodes.paragraph;
          if (!type) return false;

          const tr = state.tr
            .insert(posAfter, type.create())
            .delete($from.before(), $from.after()); // Delete the empty paragraph

          // Adjust selection for the deleted node's size (-2 for an empty <p>)
          const newSelectionPos = posAfter - 2 + 1; // or posAfter - 1
          tr.setSelection(TextSelection.create(tr.doc, newSelectionPos));

          view.dispatch(tr);
          return true;
        }

        return false;
      },
      Backspace: ({ editor }) => handleBackspace(editor),
      "Mod-Backspace": ({ editor }) => handleBackspace(editor),
      "Mod-a": ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;

        let columnNode = null;
        let columnDepth = -1;

        // 1. Robustly find the parent column and its depth.
        for (let i = $from.depth; i > 0; i--) {
          const node = $from.node(i);
          if (node.type.name === "flexColumn") {
            columnNode = node;
            columnDepth = i;
            break;
          }
        }

        // If not inside a column, let the default selectAll run.
        if (!columnNode) {
          return false;
        }

        // 2. Calculate the start and end positions of the column's content.
        const startOfContent = $from.start(columnDepth) + 1;
        const endOfContent = $from.end(columnDepth);

        // --- NEW LOGIC ---
        // 3. Check if the column is already fully selected.
        if (
          selection.from === startOfContent &&
          (selection.to === endOfContent || selection.to === endOfContent - 1)
        ) {
          return false;
        } else {
          // If not, select the column's content.
          editor
            .chain()
            .setTextSelection({ from: startOfContent, to: endOfContent })
            .run();
          // We handled the action, so block the default command.
          return true;
        }
      },
      "Mod-ArrowDown": ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        const { $from } = selection;

        let col = null;
        let colDepth = -1;

        // Robustly find the parent column and container
        for (let i = $from.depth; i > 0; i--) {
          const node = $from.node(i);
          if (node.type.name === "flexColumn") {
            col = node;
            colDepth = i;
          }
        }

        if (!col) {
          return false;
        }

        const colPos = $from.start(colDepth);
        const colSize = col.nodeSize;
        let targetPos = colPos + colSize - 3;

        // is cursor at the end of the column (-1 for column boundary)
        if ($from.pos == $from.end(colDepth) - 1) {
          targetPos = colPos + colSize;
        }

        const tr = state.tr;
        const nextSelection = Selection.near(state.doc.resolve(targetPos), 1);
        tr.setSelection(nextSelection);
        // tr.setSelection(TextSelection.create(tr.doc, targetPos));
        view.dispatch(tr);

        return true;
      },
      "Mod-ArrowUp": ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        const { $from } = selection;

        let col = null;
        let colDepth = -1;

        // Robustly find the parent column and container
        for (let i = $from.depth; i > 0; i--) {
          const node = $from.node(i);
          if (node.type.name === "flexColumn") {
            col = node;
            colDepth = i;
          }
        }

        if (!col) {
          return false;
        }

        const colPos = $from.start(colDepth);
        let targetPos = colPos;

        // is cursor at the end of the column (+1 for column boundary)
        if ($from.pos == $from.start(colDepth) + 1) {
          targetPos = colPos - 3;
        }

        const tr = state.tr;
        const nextSelection = Selection.near(state.doc.resolve(targetPos), 1);
        tr.setSelection(nextSelection);

        view.dispatch(tr);
        return true;
      },
    };
  },
});

// For tabbing between

// const { state, view } = editor;
// const { selection } = state;
// const { $from } = selection;

// let col = null;
// let container = null;
// let containerDepth = -1;

// // Robustly find the parent column and container
// for (let i = $from.depth; i > 0; i--) {
//   const node = $from.node(i);
//   if (node.type.name === "flexColumn") {
//     const parent = $from.node(i - 1);
//     if (parent?.type.name === "flexContainer") {
//       col = node;
//       container = parent;
//       containerDepth = i - 1; // The depth of the container
//       break;
//     }
//   }
// }

// if (!container) {
//   return false;
// }

// const colIndex = $from.index(containerDepth);

// // Case 1: In the FIRST column -> Jump to the second
// if (colIndex === 0 && container.childCount > 1) {
//   const containerPos = $from.start(containerDepth);
//   const firstColSize = col.nodeSize;
//   const secondColPos = containerPos + 1 + firstColSize;
//   const targetPos = secondColPos + 1;

//   const tr = state.tr;
//   tr.setSelection(TextSelection.create(tr.doc, targetPos));
//   view.dispatch(tr);
//   return true;

//   // Case 2: In the SECOND column -> Jump OUT of the container
// } else if (colIndex === 1) {
//   // Find the position immediately after the entire flexContainer
//   const posAfterContainer = $from.after(containerDepth + 1);
//   let tr = state.tr;

//   // Edge Case: If the container is the last node, create a new paragraph
//   if (posAfterContainer >= state.doc.content.size) {
//     const type = state.schema.nodes.paragraph;
//     tr.insert(posAfterContainer, type.create());
//     tr.setSelection(
//       TextSelection.create(tr.doc, posAfterContainer + 1),
//     );
//   } else {
//     // Normal case: Find the next valid cursor position automatically
//     const nextSelection = Selection.near(
//       state.doc.resolve(posAfterContainer),
//       1,
//     );
//     if (nextSelection) {
//       tr.setSelection(nextSelection);
//     }
//   }

//   view.dispatch(tr);
//   return true;
// }

// return false;
