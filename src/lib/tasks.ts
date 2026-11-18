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
