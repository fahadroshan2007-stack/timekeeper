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

export interface NotionFetchArgs {
  apiKey: string;
  databaseId: string;
}

const NOTION_STATUS_DONE = "Done";

export function parseNotionQueryResponse(json: unknown): Task[] {
  const pages = (json as { results?: unknown[] })?.results ?? [];
  const tasks: Task[] = [];

  for (const raw of pages) {
    const page = raw as {
      id?: string;
      properties?: Record<string, unknown>;
    };
    if (!page.id || !page.properties) continue;

    const titleProp = page.properties["Task"] as
      | { title?: { plain_text?: string }[] }
      | undefined;
    const statusProp = page.properties["Status"] as
      | { status?: { name?: string } }
      | undefined;
    const timeProp = page.properties["Time (Min)"] as
      | { number?: number }
      | undefined;

    const statusName = statusProp?.status?.name;
    if (statusName === NOTION_STATUS_DONE) continue;

    const title =
      titleProp?.title?.map((t) => t.plain_text ?? "").join("").trim() ?? "";

    tasks.push({
      localId: page.id,
      notionPageId: page.id,
      title,
      isChecked: false,
      accumulatedMinutes:
        typeof timeProp?.number === "number" && Number.isFinite(timeProp.number)
          ? Math.max(0, Math.trunc(timeProp.number))
          : 0,
    });
  }

  return tasks;
}

export async function fetchIncompleteTasks({
  apiKey,
  databaseId,
}: NotionFetchArgs): Promise<Task[]> {
  const response = await invoke<unknown>("notion_query_incomplete", {
    apiKey,
    databaseId,
  });
  return parseNotionQueryResponse(response);
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
