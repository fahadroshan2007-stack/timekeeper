import { invoke } from "@tauri-apps/api/core";
import type { Task } from "./tasks";
import type { WireOp, OpResult } from "./sync";

export interface NotionFetchArgs {
  apiKey: string;
  databaseId: string;
}

export interface FlushArgs {
  apiKey: string;
  databaseId: string;
  ops: WireOp[];
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

export async function flushOps({ apiKey, databaseId, ops }: FlushArgs): Promise<OpResult[]> {
  return invoke<OpResult[]>("notion_flush_ops", {
    apiKey,
    databaseId,
    ops,
  });
}
