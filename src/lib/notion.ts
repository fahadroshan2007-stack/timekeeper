import { invoke } from "@tauri-apps/api/core";
import type { Task } from "./tasks";

export interface NotionSyncAction {
  task: Task;
  type: "patch" | "create";
}

export interface NotionTaskPayload {
  taskId: string;
  notionPageId: string | null;
  title: string;
  isChecked: boolean;
  accumulatedMinutes: number;
}

export interface NotionSyncResult {
  taskId: string;
  ok: boolean;
  error?: string;
}

export interface NotionBatchSyncArgs {
  apiKey: string;
  databaseId: string;
  tasks: Task[];
}

export function planBatchSync(tasks: Task[]): NotionSyncAction[] {
  return tasks
    .filter((task) => task.isChecked)
    .map((task) => ({
      task,
      type: task.notionPageId ? ("patch" as const) : ("create" as const),
    }));
}

export async function runBatchSync({
  apiKey,
  databaseId,
  tasks,
}: NotionBatchSyncArgs): Promise<NotionSyncResult[]> {
  const actions = planBatchSync(tasks);
  const payload: NotionTaskPayload[] = actions.map(({ task }) => ({
    taskId: task.notionPageId ?? task.localId,
    notionPageId: task.notionPageId,
    title: task.title,
    isChecked: task.isChecked,
    accumulatedMinutes: task.accumulatedMinutes,
  }));

  return invoke<NotionSyncResult[]>("notion_log_batch", {
    tasks: payload,
    apiKey,
    databaseId,
  });
}
