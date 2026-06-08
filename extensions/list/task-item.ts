import {
  TaskItem as UpstreamTaskItem,
  type TaskItemOptions,
} from "@tiptap/extension-list/task-item";

export type { TaskItemOptions };

export const TaskItem = UpstreamTaskItem.extend<TaskItemOptions>({
  content: "block+",

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-.": () =>
        this.editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const { selection } = state;
            let toggled = false;

            if (selection.empty) {
              const { $from } = selection;

              for (let depth = $from.depth; depth > 0; depth -= 1) {
                const node = $from.node(depth);

                if (node.type.name === this.name) {
                  tr.setNodeMarkup($from.before(depth), undefined, {
                    ...node.attrs,
                    checked: !node.attrs.checked,
                  });
                  toggled = true;
                  break;
                }
              }
            } else {
              tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
                if (node.type.name !== this.name) {
                  return true;
                }

                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  checked: !node.attrs.checked,
                });
                toggled = true;

                return false;
              });
            }

            return toggled;
          })
          .run(),
    };
  },
});
