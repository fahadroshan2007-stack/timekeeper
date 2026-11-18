import { describe, it, expect } from "vitest";
import { planBatchSync } from "./notion";
import type { Task } from "./tasks";

const baseTask = (overrides: Partial<Task>): Task => ({
  localId: "task-1",
  notionPageId: null,
  title: "Task",
  isChecked: false,
  accumulatedMinutes: 0,
  ...overrides,
});

describe("planBatchSync", () => {
  it("plans a PATCH for checked tasks that exist in Notion", () => {
    const tasks = [baseTask({ isChecked: true, notionPageId: "page-1" })];
    expect(planBatchSync(tasks)).toEqual([{ task: tasks[0], type: "patch" }]);
  });

  it("plans a POST for checked tasks that were typed locally", () => {
    const tasks = [baseTask({ isChecked: true, notionPageId: null })];
    expect(planBatchSync(tasks)).toEqual([{ task: tasks[0], type: "create" }]);
  });

  it("skips unchecked tasks", () => {
    const tasks = [baseTask({ isChecked: false, notionPageId: "page-2" })];
    expect(planBatchSync(tasks)).toEqual([]);
  });
});
