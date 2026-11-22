import { describe, it, expect, vi } from "vitest";
import { flushOps } from "./notion";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

describe("flushOps", () => {
  it("invokes notion_flush_ops with the given ops and credentials", async () => {
    const ops = [{ opIds: ["o1"], kind: "create" as const, localId: "L", title: "A" }];
    const results = [{ opIds: ["o1"], ok: true, pageId: "P1" }];
    invoke.mockResolvedValueOnce(results);

    const out = await flushOps({ apiKey: "key", databaseId: "db", ops });

    expect(invoke).toHaveBeenCalledWith("notion_flush_ops", {
      apiKey: "key",
      databaseId: "db",
      ops,
    });
    expect(out).toEqual(results);
  });
});
