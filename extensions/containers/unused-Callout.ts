import {
  Node,
  findParentNode,
  mergeAttributes,
  wrappingInputRule,
} from "@tiptap/core";
import { liftTarget } from "@tiptap/pm/transform";

export const Callout = Node.create({
  // 1. A unique name for the node
  name: "callout",

  // 2. Define the group this node belongs to
  group: "rootOrCol",

  // 3. Define what content this node can hold. 'block+' means one or more block nodes.
  content: "block+",
  defining: true,

  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      role: {
        default: "note",
        renderHTML: (attributes) => {
          return {
            role: "note",
            "aria-roledescription": "callout",
          };
        },
        parseHTML: (element) => element.getAttribute("data-column-width"),
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[role='note']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCallout:
        () =>
        ({ state, dispatch }) => {},

      unsetCallout:
        () =>
        ({ state, dispatch, tr }) => {
          // 1. Find the parent callout. This part is correct.
          const parentInfo = findParentNode(
            (node) => node.type.name === this.name,
          )(state.selection);
          if (!parentInfo) {
            return false;
          }

          const { pos, depth, node: parentNode } = parentInfo;

          // 2. Check the depth to decide between "unwrap" and "lift". This is also correct.
          if (depth === 1) {
            // --- UNWRAP LOGIC (For top-level nodes) ---
            // This logic is simple and correct. We replace the node with its content.
            tr.replaceWith(pos, pos + parentNode.nodeSize, parentNode.content);
          } else {
            // --- LIFT LOGIC (For nested nodes) ---
            // This is the new, corrected part.

            // 3. Manually define the range to be lifted. It's the CONTENT of the parent node.
            //    The range starts right after the parent's opening tag...
            const start = pos + 1;
            //    ...and ends right before the parent's closing tag.
            const end = pos + parentNode.nodeSize - 1;

            // Create a resolvable range from these positions.
            const range = state.doc
              .resolve(start)
              .blockRange(state.doc.resolve(end));

            // If for some reason a valid block range can't be found from the content, bail.
            if (!range) {
              // This should be very rare with this new logic.
              return false;
            }

            // 4. Find where to lift this content to.
            const target = liftTarget(range);

            // If there's no valid place to lift to, bail.
            if (target == null) {
              return false;
            }

            // 5. Perform the lift.
            tr.lift(range, target);
          }

          if (dispatch) {
            dispatch(tr.scrollIntoView());
          }
          return true;
        },

      toggleCallout:
        () =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name)) {
            return commands.unsetCallout();
          } else {
            return commands.setCallout();
          }
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-]": () => this.editor.commands.toggleCallout(),
    };
  },
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\s*\]\s$/,
        type: this.type,
      }),
    ];
  },
});

export default Callout;
