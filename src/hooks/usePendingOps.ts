import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PendingOp, WireOp, OpResult } from "../lib/sync";
import { coalesceOps, applyFlushResults } from "../lib/sync";

export type EnqueueOp =
  | { kind: "create"; localId: string; title: string }
  | { kind: "done"; localId: string; notionPageId: string | null; title: string; accumulatedMinutes: number }
  | { kind: "rename"; localId: string; notionPageId: string | null; title: string }
  | { kind: "trash"; localId: string; notionPageId: string | null };

export interface FlushResult {
  ok: boolean;
  failed: number;
  skipped: boolean;
}

const PENDING_OPS_KEY = "timekeeper.pendingOps.v1";

export function usePendingOps(args: { apiKey: string; databaseId: string }) {
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
    const base: PendingOp = {
      id,
      attempts: 0,
      kind: enqueueOp.kind,
      localId: enqueueOp.localId,
      title: enqueueOp.title,
    };

    let op: PendingOp;
    switch (enqueueOp.kind) {
      case "create":
        op = base as PendingOp;
        break;
      case "done":
        op = {
          ...base,
          notionPageId: (enqueueOp as EnqueueOpDone).notionPageId,
          accumulatedMinutes: (enqueueOp as EnqueueOpDone).accumulatedMinutes,
        } as PendingOp;
        break;
      case "rename":
        op = {
          ...base,
          notionPageId: (enqueueOp as EnqueueOpRename).notionPageId,
        } as PendingOp;
        break;
      case "trash":
        op = {
          ...base,
          notionPageId: (enqueueOp as EnqueueOpTrash).notionPageId,
        } as PendingOp;
        break;
    }

    setOps((prev) => [...prev, op]);
  }, []);

  const flush = useCallback(async (): Promise<FlushResult> => {
    const { apiKey, databaseId } = args;

    if (!apiKey || !databaseId) {
      return { ok: true, failed: 0, skipped: true };
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: true, failed: 0, skipped: true };
    }

    const coalesced = coalesceOps(ops);
    if (coalesced.length === 0) {
      return { ok: true, failed: 0, skipped: true };
    }

    try {
      const results = await invoke<OpResult[]>("notion_flush_ops", {
        apiKey,
        databaseId,
        ops: coalesced,
      });

      const remaining = applyFlushResults(ops, results);
      setOps(remaining);

      const failed = results.filter((r) => !r.ok).length;
      return { ok: failed === 0, failed, skipped: false };
    } catch {
      // invoke failed — keep all ops, increment attempts
      setOps((prev) => prev.map((op) => ({ ...op, attempts: op.attempts + 1 })));
      return { ok: false, failed: coalesced.length, skipped: false };
    }
  }, [ops, args]);

  return { ops, enqueue, flush };
}
