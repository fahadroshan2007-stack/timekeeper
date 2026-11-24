import { describe, it, expect } from "vitest";
import { parseTaskList, toggleTask } from "./tasks";

describe("parseTaskList", () => {
  it("parses unchecked task list items", () => {
    const tasks = parseTaskList("- [ ] Buy milk\n- [ ] Write report");

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ title: "Buy milk", isChecked: false });
    expect(tasks[1]).toMatchObject({ title: "Write report", isChecked: false });
  });

  it("parses checked task list items", () => {
    const tasks = parseTaskList("- [x] Ship it");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: "Ship it", isChecked: true });
  });

  it("ignores lines that are not task list items", () => {
    const tasks = parseTaskList("# Heading\n\nSome prose\n\n- [ ] Real task");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("Real task");
  });
});

describe("toggleTask", () => {
  it("flips the checked state of a task", () => {
    const task = {
      localId: "task-1",
      notionPageId: null,
      title: "Task",
      isChecked: false,
      accumulatedMinutes: 0,
    };

    expect(toggleTask(task).isChecked).toBe(true);
    expect(toggleTask({ ...task, isChecked: true }).isChecked).toBe(false);
  });
});
