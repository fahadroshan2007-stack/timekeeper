import { useCallback, useState } from "react";
import {
  parseTaskList,
  toggleTask as toggleTaskState,
  addAccumulatedMinutes,
  type Task,
} from "../lib/tasks";

export interface UseTaskListResult {
  tasks: Task[];
  addTaskList: (markdown: string) => void;
  toggleTask: (taskId: string) => void;
  assignAccumulatedMinutes: (taskId: string, minutes: number) => void;
  removeTask: (taskId: string) => void;
  /** Merge tasks fetched from Notion; local unsynced tasks are kept. */
  mergeFetched: (fetched: Task[]) => void;
  /** Append a single typed task (quick-add) without re-parsing Markdown. */
  addSingleTask: (title: string) => void;
}

export function useTaskList(initialMarkdown = ""): UseTaskListResult {
  const [tasks, setTasks] = useState<Task[]>(() => parseTaskList(initialMarkdown));

  const addTaskList = useCallback((markdown: string) => {
    setTasks(parseTaskList(markdown));
  }, []);

  const toggleTask = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((task) => (task.localId === taskId ? toggleTaskState(task) : task))
    );
  }, []);

  const assignAccumulatedMinutes = useCallback((taskId: string, minutes: number) => {
    setTasks((prev) =>
      prev.map((task) => (task.localId === taskId ? addAccumulatedMinutes(task, minutes) : task))
    );
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.localId !== taskId));
  }, []);

  const mergeFetched = useCallback((fetched: Task[]) => {
    setTasks((prev) => [...prev.filter((task) => task.notionPageId === null), ...fetched]);
  }, []);

  const addSingleTask = useCallback((title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTasks((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        notionPageId: null,
        title: trimmed,
        isChecked: false,
        accumulatedMinutes: 0,
      },
    ]);
  }, []);

  return { tasks, addTaskList, toggleTask, assignAccumulatedMinutes, removeTask, mergeFetched, addSingleTask };
}
