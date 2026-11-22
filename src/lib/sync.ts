import type { Task } from "./tasks";

export type PendingOp =
  | { id: string; kind: "create"; localId: string; title: string; attempts: number }
  | { id: string; kind: "done"; localId: string; notionPageId: string | null; title: string; accumulatedMinutes: number; attempts: number }
  | { id: string; kind: "rename"; localId: string; notionPageId: string | null; title: string; attempts: number }
  | { id: string; kind: "trash"; localId: string; notionPageId: string | null; attempts: number };

export type WireOp =
  | { opIds: string[]; kind: "create"; localId: string; title: string }
  | { opIds: string[]; kind: "createDone"; localId: string; title: string; accumulatedMinutes: number }
  | { opIds: string[]; kind: "done"; localId: string; notionPageId: string; accumulatedMinutes: number }
  | { opIds: string[]; kind: "rename"; notionPageId: string; title: string }
  | { opIds: string[]; kind: "trash"; notionPageId: string };

export interface OpResult {
  opIds: string[];
  ok: boolean;
  error?: string;
  pageId?: string;
}

export interface PageIdBackfill {
  localId: string;
  pageId: string;
}

/** Page ids of successfully created pages, keyed back to their local tasks. */
export function extractPageIds(ops: PendingOp[], results: OpResult[]): PageIdBackfill[] {
  const opById = new Map(ops.map((op) => [op.id, op]));
  const byLocalId = new Map<string, string>();

  for (const result of results) {
    if (!result.ok || !result.pageId) continue;
    for (const opId of result.opIds) {
      const op = opById.get(opId);
      if (op) byLocalId.set(op.localId, result.pageId);
    }
  }

  return [...byLocalId].map(([localId, pageId]) => ({ localId, pageId }));
}

function lastOf<T>(ops: T[], accessor: (op: T) => string): string | undefined {
  for (let i = ops.length - 1; i >= 0; i--) {
    const value = accessor(ops[i]);
    if (value) return value;
  }
  return undefined;
}

export function coalesceOps(ops: PendingOp[]): WireOp[] {
  const byLocalId = new Map<string, PendingOp[]>();
  const order: string[] = [];
  for (const op of ops) {
    if (!byLocalId.has(op.localId)) {
      byLocalId.set(op.localId, []);
      order.push(op.localId);
    }
    byLocalId.get(op.localId)!.push(op);
  }

  const creates: WireOp[] = [];
  const dones: WireOp[] = [];
  const renames: WireOp[] = [];
  const trashes: WireOp[] = [];

  for (const localId of order) {
    const group = byLocalId.get(localId)!;
    const groupCreates = group.filter((op) => op.kind === "create");
    const groupDones = group.filter((op) => op.kind === "done");
    const groupRenames = group.filter((op) => op.kind === "rename");
    const groupTrashes = group.filter((op) => op.kind === "trash");
    const createIds = groupCreates.map((op) => op.id);

    if (groupCreates.length > 0) {
      // create + done + trash, or create + trash ⇒ the page never existed
      if (groupTrashes.length > 0) {
        continue;
      }
      if (groupDones.length > 0) {
        const done = groupDones[groupDones.length - 1];
        creates.push({
          opIds: [...createIds, ...groupDones.map((op) => op.id)],
          kind: "createDone",
          localId,
          title: lastOf(groupRenames, (o) => o.title) ?? done.title,
          accumulatedMinutes: done.accumulatedMinutes,
        });
        continue;
      }
      if (groupRenames.length > 0) {
        const rename = groupRenames[groupRenames.length - 1];
        creates.push({
          opIds: [...createIds, ...groupRenames.map((op) => op.id)],
          kind: "create",
          localId,
          title: rename.title,
        });
        continue;
      }
      const create = groupCreates[groupCreates.length - 1];
      creates.push({ opIds: createIds, kind: "create", localId, title: create.title });
      continue;
    }

    // No create for this task.
    for (const done of groupDones) {
      if (done.notionPageId) {
        dones.push({ opIds: [done.id], kind: "done", localId, notionPageId: done.notionPageId, accumulatedMinutes: done.accumulatedMinutes });
      } else {
        creates.push({ opIds: [done.id], kind: "createDone", localId, title: done.title, accumulatedMinutes: done.accumulatedMinutes });
      }
    }
    for (const rename of groupRenames) {
      if (rename.notionPageId) {
        renames.push({ opIds: [rename.id], kind: "rename", notionPageId: rename.notionPageId, title: rename.title });
      }
    }
    for (const trash of groupTrashes) {
      if (trash.notionPageId) {
        trashes.push({ opIds: [trash.id], kind: "trash", notionPageId: trash.notionPageId });
      }
    }
  }

  return [...creates, ...dones, ...renames, ...trashes];
}

export function applyFlushResults(ops: PendingOp[], results: OpResult[]): PendingOp[] {
  const opById = new Map<string, PendingOp>();
  for (const op of ops) opById.set(op.id, op);

  const pageIdByLocalId = new Map<string, string>();
  for (const result of results) {
    if (result.ok && result.pageId) {
      for (const opId of result.opIds) {
        const op = opById.get(opId);
        if (op && "localId" in op) pageIdByLocalId.set(op.localId, result.pageId);
      }
    }
  }

  const succeededIds = new Set<string>();
  const failedIds = new Set<string>();
  for (const result of results) {
    for (const opId of result.opIds) {
      (result.ok ? succeededIds : failedIds).add(opId);
    }
  }

  return ops
    .filter((op) => !succeededIds.has(op.id))
    .map((op) => {
      let next = op;
      if ("notionPageId" in next && next.notionPageId === null) {
        const pageId = pageIdByLocalId.get(next.localId);
        if (pageId) next = { ...next, notionPageId: pageId } as PendingOp;
      }
      if (failedIds.has(op.id)) next = { ...next, attempts: next.attempts + 1 };
      return next;
    });
}

export function filterFetched(fetched: Task[], ops: PendingOp[]): Task[] {
  const blocked = new Set<string>();
  for (const op of ops) {
    if ((op.kind === "done" || op.kind === "trash") && op.notionPageId) {
      blocked.add(op.notionPageId);
    }
  }
  return fetched.filter((task) => task.notionPageId === null || !blocked.has(task.notionPageId));
}
