import { useCallback, useEffect, useState } from "react";
import type { PageIdBackfill } from "../lib/sync";
import {
  parseTaskList,
  toggleTask as toggleTaskState,
  addAccumulatedMinutes,
  renameTask,
  reconcileParsed,
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
  /** Append a single typed task; optional explicit localId so App can pair it with a queued create op. */
  addSingleTask: (title: string, localId?: string) => void;
  /** Rename a task in place; blank titles are ignored and return the task unchanged. */
  renameTask: (taskId: string, title: string) => void;
  /** Link local tasks to Notion pages created for them (only fills missing ids). */
  applyPageIds: (backfills: PageIdBackfill[]) => void;
}

export const TASKS_KEY = "timekeeper.tasks.v1";

export function useTaskList(): UseTaskListResult {
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const raw = localStorage.getItem(TASKS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Task[];
    } catch {
      // fall through to the empty fallback below
    }
    // eslint-disable-next-line no-console
    console.warn(`Failed to read ${TASKS_KEY} from localStorage; starting with an empty task list`);
    return [];
  });

  const persist = useCallback((next: Task[]) => {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable/quota — keep running in memory.
    }
  }, []);

  // Write-through persistence: every task-list change lands in localStorage.
  useEffect(() => {
    persist(tasks);
  }, [tasks, persist]);

  const addTaskList = useCallback((markdown: string) => {
    setTasks((prev) => reconcileParsed(prev, parseTaskList(markdown)));
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
    setTasks((prev) => {
      const merged: Task[] = [];
      for (const task of prev) {
        if (task.notionPageId) {
          const update = fetched.find((f) => f.notionPageId === task.notionPageId);
          merged.push(update ? { ...task, title: update.title } : task);
        } else {
          merged.push(task);
        }
      }
      const existingPageIds = new Set(
        prev.filter((task) => task.notionPageId).map((task) => task.notionPageId)
      );
      for (const f of fetched) {
        if (!existingPageIds.has(f.notionPageId)) merged.push(f);
      }
      return merged;
    });
  }, []);

  const addSingleTask = useCallback((title: string, localId?: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTasks((prev) => [
      ...prev,
      {
        localId: localId ?? crypto.randomUUID(),
        notionPageId: null,
        title: trimmed,
        isChecked: false,
        accumulatedMinutes: 0,
      },
    ]);
  }, []);

  const renameTaskFn = useCallback((taskId: string, title: string) => {
    setTasks((prev) =>
      prev.map((task) => (task.localId === taskId ? renameTask(task, title) : task))
    );
  }, []);

  const applyPageIds = useCallback((backfills: PageIdBackfill[]) => {
    if (backfills.length === 0) return;
    const pageIdByLocalId = new Map(backfills.map((b) => [b.localId, b.pageId]));
    setTasks((prev) =>
      prev.map((task) => {
        if (task.notionPageId) return task;
        const pageId = pageIdByLocalId.get(task.localId);
        return pageId ? { ...task, notionPageId: pageId } : task;
      })
    );
  }, []);

  return {
    tasks,
    addTaskList,
    toggleTask,
    assignAccumulatedMinutes,
    removeTask,
    mergeFetched,
    addSingleTask,
    renameTask: renameTaskFn,
    applyPageIds,
  };
}
