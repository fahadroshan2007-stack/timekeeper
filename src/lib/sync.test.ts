import { describe, it, expect } from "vitest";
import type { Task } from "./tasks";
import type { ProgressStatus, PendingOp, OpResult } from "./sync";
import { coalesceOps, applyFlushResults, filterFetched, extractPageIds, statusFor } from "./sync";

const fetched = (overrides: Partial<Task> = {}): Task => ({
  localId: "page-1",
  notionPageId: "page-1",
  title: "Fetched",
  isChecked: false,
  accumulatedMinutes: 0,
  ...overrides,
});

const createOp = (id: string, localId: string, title: string): PendingOp => ({
  id,
  kind: "create",
  localId,
  title,
  attempts: 0,
});

const doneOp = (
  id: string,
  localId: string,
  notionPageId: string | null,
  title: string,
  minutes: number
): PendingOp => ({
  id,
  kind: "done",
  localId,
  notionPageId,
  title,
  accumulatedMinutes: minutes,
  attempts: 0,
});

const renameOp = (
  id: string,
  localId: string,
  notionPageId: string | null,
  title: string
): PendingOp => ({
  id,
  kind: "rename",
  localId,
  notionPageId,
  title,
  attempts: 0,
});

const trashOp = (id: string, localId: string, notionPageId: string | null): PendingOp => ({
  id,
  kind: "trash",
  localId,
  notionPageId,
  attempts: 0,
});

const progressOp = (
  id: string,
  localId: string,
  notionPageId: string | null,
  title: string,
  status: ProgressStatus,
  minutes: number
): PendingOp => ({
  id,
  kind: "progress",
  localId,
  notionPageId,
  title,
  status,
  accumulatedMinutes: minutes,
  attempts: 0,
});

describe("coalesceOps", () => {
  it("folds create + rename into one create with the rename title", () => {
    const ops = [createOp("o1", "L", "A"), renameOp("o2", "L", null, "B")];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1", "o2"], kind: "create", localId: "L", title: "B" },
    ]);
  });

  it("folds create + done into createDone with done title and minutes", () => {
    const ops = [createOp("o1", "L", "A"), doneOp("o2", "L", null, "B", 25)];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1", "o2"], kind: "createDone", localId: "L", title: "B", accumulatedMinutes: 25 },
    ]);
  });

  it("drops create → done → trash (page never existed)", () => {
    const ops = [
      createOp("o1", "L", "A"),
      doneOp("o2", "L", null, "B", 25),
      trashOp("o3", "L", null),
    ];
    expect(coalesceOps(ops)).toEqual([]);
  });

  it("drops create → trash (page never existed)", () => {
    const ops = [createOp("o1", "L", "A"), trashOp("o2", "L", null)];
    expect(coalesceOps(ops)).toEqual([]);
  });

  it("turns a done op with no page id and no create into createDone", () => {
    const ops = [doneOp("o1", "L", null, "A", 10)];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1"], kind: "createDone", localId: "L", title: "A", accumulatedMinutes: 10 },
    ]);
  });

  it("drops a rename with no page id and no create", () => {
    const ops = [renameOp("o1", "L", null, "A")];
    expect(coalesceOps(ops)).toEqual([]);
  });

  it("drops a trash with no page id and no create", () => {
    const ops = [trashOp("o1", "L", null)];
    expect(coalesceOps(ops)).toEqual([]);
  });

  it("emits done and rename wire ops separately when a page id is known", () => {
    const ops = [doneOp("o1", "L", "P", "A", 5), renameOp("o2", "L", "P", "B")];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1"], kind: "done", localId: "L", notionPageId: "P", accumulatedMinutes: 5 },
      { opIds: ["o2"], kind: "rename", notionPageId: "P", title: "B" },
    ]);
  });

  it("emits creates/dones first, then renames, then trashes across the whole queue", () => {
    const ops = [
      trashOp("t1", "LT", "PT"),
      renameOp("r1", "LR", "PR", "R"),
      doneOp("d1", "LD", "PD", "D", 1),
      createOp("c1", "LC", "C"),
    ];
    const wire = coalesceOps(ops);
    expect(wire.map((w) => w.kind)).toEqual(["create", "done", "rename", "trash"]);
    expect(wire.map((w) => w.opIds)).toEqual([["c1"], ["d1"], ["r1"], ["t1"]]);
  });

  it("preserves first-appearance group order for independent tasks", () => {
    const ops = [
      createOp("o1", "L1", "A"),
      createOp("o2", "L2", "B"),
    ];
    expect(coalesceOps(ops).map((w) => ("localId" in w ? w.localId : ""))).toEqual(["L1", "L2"]);
  });

  it("returns an empty array for no ops", () => {
    expect(coalesceOps([])).toEqual([]);
  });
});

describe("coalesceOps progress ops", () => {
  it("folds create + progress into one createProgress", () => {
    const ops = [createOp("o1", "L", "A"), progressOp("o2", "L", null, "B", "In Progress", 4)];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1", "o2"], kind: "createProgress", localId: "L", title: "B", status: "In Progress", accumulatedMinutes: 4 },
    ]);
  });

  it("folds create + progress + rename into one createProgress with the rename title", () => {
    const ops = [
      createOp("o1", "L", "A"),
      progressOp("o2", "L", null, "B", "In Progress", 4),
      renameOp("o3", "L", null, "D"),
    ];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1", "o2", "o3"], kind: "createProgress", localId: "L", title: "D", status: "In Progress", accumulatedMinutes: 4 },
    ]);
  });

  it("folds create + progress + done into createDone (done wins)", () => {
    const ops = [
      createOp("o1", "L", "A"),
      progressOp("o2", "L", null, "B", "In Progress", 4),
      doneOp("o3", "L", null, "C", 5),
    ];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1", "o3", "o2"], kind: "createDone", localId: "L", title: "C", accumulatedMinutes: 5 },
    ]);
  });

  it("turns progress without a page id and without create into createProgress", () => {
    const ops = [progressOp("o1", "L", null, "A", "Not Started", 0)];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1"], kind: "createProgress", localId: "L", title: "A", status: "Not Started", accumulatedMinutes: 0 },
    ]);
  });

  it("emits progress as a PATCH wire op when the page id is known", () => {
    const ops = [progressOp("o1", "L", "P", "A", "In Progress", 7)];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1"], kind: "progress", localId: "L", notionPageId: "P", status: "In Progress", accumulatedMinutes: 7 },
    ]);
  });

  it("drops progress when a done exists for the same task", () => {
    const ops = [doneOp("o1", "L", "P", "A", 5), progressOp("o2", "L", "P", "B", "In Progress", 3)];
    expect(coalesceOps(ops)).toEqual([
      { opIds: ["o1", "o2"], kind: "done", localId: "L", notionPageId: "P", accumulatedMinutes: 5 },
    ]);
  });

  it("emits create, createProgress, progress, done, trash in wire order across the queue", () => {
    const ops = [
      trashOp("t1", "LT", "PT"),
      progressOp("p1", "LPR", "PR", "A", "In Progress", 2),
      doneOp("d1", "LD", "PD", "D", 1),
      createOp("c1", "LC", "C"),
      createOp("c2", "LC2", "C2"),
      progressOp("p2", "LC2", null, "C2b", "Not Started", 0),
    ];
    expect(coalesceOps(ops).map((w) => w.kind)).toEqual(["create", "createProgress", "progress", "done", "trash"]);
  });
});

describe("statusFor", () => {
  it("maps minutes to status literals", () => {
    expect(statusFor(0)).toBe("Not Started");
    expect(statusFor(1)).toBe("In Progress");
    expect(statusFor(42)).toBe("In Progress");
  });
});

describe("applyFlushResults", () => {
  it("retires succeeded source ops and keeps failures with incremented attempts", () => {
    const ops = [
      createOp("o1", "L1", "A"),
      doneOp("o2", "L2", null, "B", 5),
    ];
    const results: OpResult[] = [
      { opIds: ["o1"], ok: true },
      { opIds: ["o2"], ok: false, error: "boom" },
    ];
    const remaining = applyFlushResults(ops, results);

    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("o2");
    expect((remaining[0] as any).attempts).toBe(1);
    expect((remaining[0] as any).error).toBeUndefined();
  });

  it("backfills a create's pageId into same-localId done/rename/trash ops", () => {
    const ops = [
      createOp("o1", "L", "A"),
      doneOp("o2", "L", null, "B", 5),
      renameOp("o3", "L", null, "C"),
    ];
    const results: OpResult[] = [
      { opIds: ["o1"], ok: true, pageId: "P1" },
    ];
    const remaining = applyFlushResults(ops, results);

    expect(remaining).toHaveLength(2);
    expect((remaining.find((op) => op.id === "o2") as any).notionPageId).toBe("P1");
    expect((remaining.find((op) => op.id === "o3") as any).notionPageId).toBe("P1");
  });

  it("does not backfill into ops of a different localId", () => {
    const ops = [
      createOp("o1", "L1", "A"),
      doneOp("o2", "L2", null, "B", 5),
    ];
    const results: OpResult[] = [{ opIds: ["o1"], ok: true, pageId: "P1" }];
    const remaining = applyFlushResults(ops, results);

    expect((remaining.find((op) => op.id === "o2") as any).notionPageId).toBeNull();
  });
});

describe("extractPageIds", () => {
  it("maps successful page ids back to the local tasks that created them", () => {
    const ops = [createOp("o1", "L1", "A"), createOp("o2", "L2", "B")];
    const results: OpResult[] = [
      { opIds: ["o1"], ok: true, pageId: "P1" },
      { opIds: ["o2"], ok: false },
    ];

    expect(extractPageIds(ops, results)).toEqual([{ localId: "L1", pageId: "P1" }]);
  });

  it("ignores results without a page id and deduplicates by local id", () => {
    const ops = [createOp("o1", "L", "A"), renameOp("o2", "L", null, "B")];
    const results: OpResult[] = [
      { opIds: ["o1"], ok: true },
      { opIds: ["o2"], ok: true, pageId: "P1" },
      { opIds: ["o1", "o2"], ok: true, pageId: "P2" },
    ];

    expect(extractPageIds(ops, results)).toEqual([{ localId: "L", pageId: "P2" }]);
  });
});

describe("filterFetched", () => {
  it("drops fetched pages backed by queued done or trash ops", () => {
    const pages = [
      fetched({ localId: "f1", notionPageId: "page-1", title: "Done-soon" }),
      fetched({ localId: "f2", notionPageId: "page-2", title: "Deleted-soon" }),
      fetched({ localId: "f3", notionPageId: "page-3", title: "Safe" }),
    ];
    const ops = [
      doneOp("o1", "whatever", "page-1", "Done-soon", 0),
      trashOp("o2", "whatever", "page-2"),
    ];
    const kept = filterFetched(pages, ops);

    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe("Safe");
  });

  it("keeps fetched pages that have no pending op", () => {
    const pages = [fetched({ title: "Safe" })];
    expect(filterFetched(pages, [doneOp("o1", "x", "other-page", "y", 0)])).toEqual(pages);
  });

  it("returns all pages when there are no pending ops", () => {
    const pages = [fetched(), fetched({ localId: "f2", title: "B" })];
    expect(filterFetched(pages, [])).toEqual(pages);
  });
});
