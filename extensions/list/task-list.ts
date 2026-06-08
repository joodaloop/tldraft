import {
  TaskList as UpstreamTaskList,
  type TaskListOptions,
} from "@tiptap/extension-list/task-list";

export type { TaskListOptions };

export const TaskList = UpstreamTaskList.extend<TaskListOptions>({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Alt-9": () => this.editor.commands.toggleTaskList(),
      "Mod-Alt-t": () => this.editor.commands.toggleTaskList(),
    };
  },
});
