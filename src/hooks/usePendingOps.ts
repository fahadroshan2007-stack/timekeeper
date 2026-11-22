import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PendingOp, OpResult, PageIdBackfill, ProgressStatus } from "../lib/sync";
import { coalesceOps, applyFlushResults, extractPageIds } from "../lib/sync";

export type EnqueueOp =
  | { kind: "create"; localId: string; title: string }
  | { kind: "done"; localId: string; notionPageId: string | null; title: string; accumulatedMinutes: number }
  | { kind: "rename"; localId: string; notionPageId: string | null; title: string }
  | { kind: "trash"; localId: string; notionPageId: string | null };

/**
 * Args for enqueueing an undone-task progress write (design: event-driven
 * autolog). `kind` is fixed to "progress"; dedupe identity is
 * localId + notionPageId + status + accumulatedMinutes.
 */
export type EnqueueProgress = {
  kind: "progress";
  localId: string;
  notionPageId: string | null;
  title: string;
  status: ProgressStatus;
  accumulatedMinutes: number;
};

export interface FlushResult {
  ok: boolean;
  failed: number;
  skipped: boolean;
  /** Page ids returned for just-created tasks, for linking local tasks to Notion. */
  backfills: PageIdBackfill[];
}

const PENDING_OPS_KEY = "timekeeper.pendingOps.v1";

export function usePendingOps(args: { apiKey: string; databaseId: string }) {
  const { apiKey, databaseId } = args;
  const flushingRef = useRef(false);
  const [ops, setOps] = useState<PendingOp[]>(() => {
    try {
      const raw = localStorage.getItem(PENDING_OPS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as PendingOp[];
    } catch {
      // fall through to empty fallback
    }
    // eslint-disable-next-line no-console
    console.warn(`Failed to read ${PENDING_OPS_KEY} from localStorage; starting with an empty queue`);
    return [];
  });

  const persist = useCallback((next: PendingOp[]) => {
    try {
      localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable/quota — keep running in memory.
    }
  }, []);

  // Write-through persistence: every queue change lands in localStorage.
  useEffect(() => {
    persist(ops);
  }, [ops, persist]);

  const enqueue = useCallback((enqueueOp: EnqueueOp) => {
    const id = crypto.randomUUID();
    let op: PendingOp;

    switch (enqueueOp.kind) {
      case "create":
        op = {
          id,
          kind: "create",
          localId: enqueueOp.localId,
          title: enqueueOp.title,
          attempts: 0,
        };
        break;
      case "done":
        op = {
          id,
          kind: "done",
          localId: enqueueOp.localId,
          notionPageId: enqueueOp.notionPageId,
          title: enqueueOp.title,
          accumulatedMinutes: enqueueOp.accumulatedMinutes,
          attempts: 0,
        };
        break;
      case "rename":
        op = {
          id,
          kind: "rename",
          localId: enqueueOp.localId,
          notionPageId: enqueueOp.notionPageId,
          title: enqueueOp.title,
          attempts: 0,
        };
        break;
      case "trash":
        op = {
          id,
          kind: "trash",
          localId: enqueueOp.localId,
          notionPageId: enqueueOp.notionPageId,
          attempts: 0,
        };
        break;
    }

    setOps((prev) => [...prev, op]);
  }, []);

  const enqueueProgress = useCallback((enqueueOp: EnqueueProgress) => {
    const op: Extract<PendingOp, { kind: "progress" }> = {
      id: crypto.randomUUID(),
      kind: "progress",
      localId: enqueueOp.localId,
      notionPageId: enqueueOp.notionPageId,
      title: enqueueOp.title,
      status: enqueueOp.status,
      accumulatedMinutes: enqueueOp.accumulatedMinutes,
      attempts: 0,
    };

    setOps((prev) => {
      // Dedupe against an identical pending op (design: skip when the same
      // localId + notionPageId + status + accumulatedMinutes is already queued).
      const existing = prev.find(
        (op) =>
          op.kind === "progress" &&
          op.localId === enqueueOp.localId &&
          op.notionPageId === enqueueOp.notionPageId &&
          op.status === enqueueOp.status &&
          op.accumulatedMinutes === enqueueOp.accumulatedMinutes
      );
      if (existing) return prev;
      return [...prev, op];
    });
  }, []);

  const flush = useCallback(async (): Promise<FlushResult> => {
    const skip = (): FlushResult => ({ ok: true, failed: 0, skipped: true, backfills: [] });

    // Overlapping flushes would coalesce the same ops twice (duplicate pages).
    if (flushingRef.current) return skip();

    if (!apiKey || !databaseId) return skip();
    if (typeof navigator !== "undefined" && navigator.onLine === false) return skip();

    const coalesced = coalesceOps(ops);
    if (coalesced.length === 0) return skip();

    flushingRef.current = true;
    try {
      const results = await invoke<OpResult[]>("notion_flush_ops", {
        apiKey,
        databaseId,
        ops: coalesced,
      });

      const remaining = applyFlushResults(ops, results);
      setOps(remaining);

      const failed = results.filter((r) => !r.ok).length;
      return {
        ok: failed === 0,
        failed,
        skipped: false,
        backfills: extractPageIds(ops, results),
      };
    } catch {
      // invoke failed — keep all ops, increment attempts
      setOps((prev) => prev.map((op) => ({ ...op, attempts: op.attempts + 1 })));
      return { ok: false, failed: coalesced.length, skipped: false, backfills: [] };
    } finally {
      flushingRef.current = false;
    }
  }, [ops, apiKey, databaseId]);

  return { ops, enqueue, enqueueProgress, flush };
}
