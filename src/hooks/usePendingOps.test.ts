import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePendingOps, type EnqueueProgress } from "./usePendingOps";
import type { PendingOp, OpResult } from "../lib/sync";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

const creds = { apiKey: "test-key", databaseId: "test-db" };

const pendingOpsKey = "timekeeper.pendingOps.v1";

const seedOps = (ops: PendingOp[]) => {
  localStorage.setItem(pendingOpsKey, JSON.stringify(ops));
};

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "notion_flush_ops") return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
  });
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("usePendingOps", () => {
  it("initializes the queue from localStorage", () => {
    const stored: PendingOp[] = [
      { id: "stored-1", kind: "create", localId: "L", title: "A", attempts: 0 },
    ];
    seedOps(stored);

    const { result } = renderHook(() => usePendingOps(creds));

    expect(result.current.ops).toEqual(stored);
  });

  it("falls back to an empty queue for malformed JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(pendingOpsKey, "{ not json ");

    const { result } = renderHook(() => usePendingOps(creds));

    expect(result.current.ops).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("enqueues an op with a generated id and persists it", () => {
    const { result } = renderHook(() => usePendingOps(creds));

    act(() => result.current.enqueue({ kind: "create", localId: "L", title: "A" }));

    expect(result.current.ops).toHaveLength(1);
    expect(typeof result.current.ops[0].id).toBe("string");
    expect(result.current.ops[0].attempts).toBe(0);
    expect(JSON.parse(localStorage.getItem(pendingOpsKey)!)).toHaveLength(1);
  });

  it("flush with no credentials skips the invoke entirely", async () => {
    const { result } = renderHook(() => usePendingOps({ apiKey: "", databaseId: "db" }));

    const out = await act(async () => result.current.flush());

    expect(invoke).not.toHaveBeenCalled();
    expect(out.skipped).toBe(true);
    expect(out.ok).toBe(true);
  });

  it("flush while offline skips the invoke entirely", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const { result } = renderHook(() => usePendingOps(creds));
    act(() => result.current.enqueue({ kind: "create", localId: "L", title: "A" }));

    const out = await act(async () => result.current.flush());

    expect(invoke).not.toHaveBeenCalled();
    expect(out.skipped).toBe(true);
  });

  it("flush coalesces queued ops into a single notion_flush_ops invoke", async () => {
    const { result } = renderHook(() => usePendingOps(creds));
    act(() => result.current.enqueue({ kind: "create", localId: "L", title: "A" }));
    act(() => result.current.enqueue({ kind: "rename", localId: "L", notionPageId: "P", title: "B" }));
    const ids = result.current.ops.map((op) => op.id);

    invoke.mockImplementation((cmd: string) => {
      if (cmd === "notion_flush_ops")
        return Promise.resolve([{ opIds: ids, ok: true, pageId: "P" }]);
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    const out = await act(async () => result.current.flush());

    expect(out.skipped).toBe(false);
    expect(out.ok).toBe(true);
    expect(out.failed).toBe(0);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("notion_flush_ops", {
      apiKey: "test-key",
      databaseId: "test-db",
      ops: [{ opIds: ids, kind: "create", localId: "L", title: "B" }],
    });
    expect(result.current.ops).toHaveLength(0);
  });

  it("flush success retires succeeded ops and backfills the page id into same-localId ops", async () => {
    const { result } = renderHook(() => usePendingOps(creds));
    act(() => result.current.enqueue({ kind: "create", localId: "L", title: "A" }));
    act(() => result.current.enqueue({ kind: "done", localId: "L", notionPageId: null, title: "B", accumulatedMinutes: 5 }));
    const [createId, doneId] = result.current.ops.map((op) => op.id);

    invoke.mockImplementation((cmd: string) => {
      if (cmd === "notion_flush_ops")
        return Promise.resolve([{ opIds: [createId], ok: true, pageId: "P1" }]);
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    await act(async () => result.current.flush());

    expect(result.current.ops).toHaveLength(1);
    expect(result.current.ops[0].id).toBe(doneId);
    expect((result.current.ops[0] as any).notionPageId).toBe("P1");
  });

  it("keeps a stable flush callback across rerenders with the same credentials", () => {
    const { result, rerender } = renderHook(
      ({ apiKey, databaseId }) => usePendingOps({ apiKey, databaseId }),
      { initialProps: { apiKey: "test-key", databaseId: "test-db" } }
    );
    const firstFlush = result.current.flush;

    rerender({ apiKey: "test-key", databaseId: "test-db" });

    expect(result.current.flush).toBe(firstFlush);
  });

  it("does not invoke twice when flush is called while a flush is in flight", async () => {
    const { result } = renderHook(() => usePendingOps(creds));
    act(() => result.current.enqueue({ kind: "create", localId: "L", title: "A" }));
    const opIds = result.current.ops.map((op) => op.id);

    let resolveInvoke: ((value: OpResult[]) => void) | undefined;
    invoke.mockImplementation(
      () =>
        new Promise<OpResult[]>((resolve) => {
          resolveInvoke = resolve;
        })
    );

    const first = result.current.flush();
    const second = result.current.flush();
    expect(second).toBeInstanceOf(Promise);

    await act(async () => {
      resolveInvoke!([{ opIds, ok: true, pageId: "P1" }]);
      await Promise.all([first, second]);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("flush invoke failure keeps every op and reports ok: false", async () => {
    const { result } = renderHook(() => usePendingOps(creds));
    act(() => result.current.enqueue({ kind: "done", localId: "L1", notionPageId: "P1", title: "A", accumulatedMinutes: 5 }));
    act(() => result.current.enqueue({ kind: "trash", localId: "L2", notionPageId: "P2" }));

    invoke.mockRejectedValueOnce(new Error("notion down"));

    const out = await act(async () => result.current.flush());

    expect(out.ok).toBe(false);
    expect(out.skipped).toBe(false);
    expect(result.current.ops).toHaveLength(2);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("enqueueProgress", () => {
  it("enqueues an identical progress op only once", () => {
    const { result } = renderHook(() => usePendingOps(creds));
    const args: EnqueueProgress = {
      kind: "progress",
      localId: "L",
      notionPageId: null,
      title: "A",
      status: "In Progress",
      accumulatedMinutes: 5,
    };

    act(() => result.current.enqueueProgress(args));
    act(() => result.current.enqueueProgress(args));

    expect(result.current.ops).toHaveLength(1);
    expect(result.current.ops[0]).toMatchObject(args);
  });

  it("enqueues another op when minutes or status change", () => {
    const { result } = renderHook(() => usePendingOps(creds));

    act(() => result.current.enqueueProgress({ kind: "progress", localId: "L", notionPageId: null, title: "A", status: "In Progress", accumulatedMinutes: 5 }));
    act(() => result.current.enqueueProgress({ kind: "progress", localId: "L", notionPageId: null, title: "A", status: "In Progress", accumulatedMinutes: 10 }));
    expect(result.current.ops).toHaveLength(2);

    act(() => result.current.enqueueProgress({ kind: "progress", localId: "L", notionPageId: null, title: "A", status: "Not Started", accumulatedMinutes: 10 }));
    expect(result.current.ops).toHaveLength(3);
  });

  it("does not dedupe progress ops for different tasks", () => {
    const { result } = renderHook(() => usePendingOps(creds));

    act(() => result.current.enqueueProgress({ kind: "progress", localId: "L1", notionPageId: null, title: "A", status: "In Progress", accumulatedMinutes: 5 }));
    act(() => result.current.enqueueProgress({ kind: "progress", localId: "L2", notionPageId: null, title: "A", status: "In Progress", accumulatedMinutes: 5 }));

    expect(result.current.ops).toHaveLength(2);
  });
});
