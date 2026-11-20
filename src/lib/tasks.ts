export interface Task {
  localId: string;
  notionPageId: string | null;
  title: string;
  isChecked: boolean;
  accumulatedMinutes: number;
}

const TASK_LINE_PATTERN = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/;

export function parseTaskList(markdown: string): Task[] {
  const tasks: Task[] = [];

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(TASK_LINE_PATTERN);
    if (!match) continue;

    tasks.push({
      localId: crypto.randomUUID(),
      notionPageId: null,
      title: match[2].trim(),
      isChecked: match[1].toLowerCase() === "x",
      accumulatedMinutes: 0,
    });
  }

  return tasks;
}

export function toggleTask(task: Task): Task {
  return { ...task, isChecked: !task.isChecked };
}

export function addAccumulatedMinutes(task: Task, minutes: number): Task {
  return { ...task, accumulatedMinutes: task.accumulatedMinutes + minutes };
}

export function renameTask(task: Task, title: string): Task {
  const trimmed = title.trim();
  if (!trimmed) return task;
  return { ...task, title: trimmed };
}

export function tasksToMarkdown(tasks: Task[]): string {
  return tasks.map((task) => `- [${task.isChecked ? "x" : " "}] ${task.title}`).join("\n");
}

export function reconcileParsed(existing: Task[], parsed: Task[]): Task[] {
  const used = new Array(existing.length).fill(false);
  const reconciled: Task[] = [];

  for (const parsedTask of parsed) {
    const matchIdx = existing.findIndex(
      (task, idx) => !used[idx] && task.title === parsedTask.title
    );

    if (matchIdx !== -1) {
      used[matchIdx] = true;
      const existingTask = existing[matchIdx];
      reconciled.push({
        localId: existingTask.localId,
        notionPageId: existingTask.notionPageId,
        title: parsedTask.title.trim(),
        isChecked: parsedTask.isChecked,
        accumulatedMinutes: existingTask.accumulatedMinutes,
      });
    } else {
      reconciled.push({ ...parsedTask });
    }
  }

  return reconciled;
}
