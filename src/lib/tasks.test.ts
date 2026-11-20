import { describe, it, expect } from "vitest";
import { parseTaskList, toggleTask, renameTask, reconcileParsed, tasksToMarkdown } from "./tasks";

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

describe("renameTask", () => {
  const base = {
    localId: "task-1",
    notionPageId: null,
    title: "Buy milk",
    isChecked: false,
    accumulatedMinutes: 0,
  };

  it("renames to the trimmed title", () => {
    expect(renameTask(base, "  Ship it  ")).toMatchObject({ title: "Ship it" });
  });

  it("returns the same task object for whitespace-only titles", () => {
    expect(renameTask(base, "   ")).toBe(base);
    expect(renameTask(base, "")).toBe(base);
  });
});

describe("reconcileParsed", () => {
  const existing = [
    {
      localId: "existing-a",
      notionPageId: "page-1",
      title: "Buy milk",
      isChecked: false,
      accumulatedMinutes: 25,
    },
    {
      localId: "existing-b",
      notionPageId: null,
      title: "Ship it",
      isChecked: true,
      accumulatedMinutes: 0,
    },
  ];

  it("preserves localId, notionPageId and accumulatedMinutes for title-matched rows", () => {
    const parsed = parseTaskList("- [ ] Buy milk\n- [ ] Ship it");
    const reconciled = reconcileParsed(existing, parsed);

    expect(reconciled).toHaveLength(2);
    expect(reconciled[0].localId).toBe("existing-a");
    expect(reconciled[0].notionPageId).toBe("page-1");
    expect(reconciled[0].accumulatedMinutes).toBe(25);
    expect(reconciled[1].localId).toBe("existing-b");
    expect(reconciled[1].accumulatedMinutes).toBe(0);
  });

  it("updates title and checked state from the parsed row", () => {
    const parsed = parseTaskList("- [x] Milk\n- [ ] Ship it");
    const reconciled = reconcileParsed(existing, parsed);

    expect(reconciled[0].title).toBe("Milk");
    expect(reconciled[0].isChecked).toBe(true);
    expect(reconciled[1].title).toBe("Ship it");
    expect(reconciled[1].isChecked).toBe(false);
  });

  it("assigns fresh ids to unmatched parsed tasks", () => {
    const parsed = parseTaskList("- [ ] Buy milk\n- [ ] Ship it\n- [ ] New one");
    const reconciled = reconcileParsed(existing, parsed);

    expect(reconciled).toHaveLength(3);
    expect(reconciled[2].localId).not.toBe("existing-a");
    expect(reconciled[2].localId).not.toBe("existing-b");
    expect(reconciled[2].title).toBe("New one");
  });

  it("is stable with duplicated titles (first unmatched existing row wins)", () => {
    const duplicatedExisting = [
      ...existing,
      { ...existing[0], localId: "existing-c", notionPageId: "page-2", accumulatedMinutes: 5 },
    ];
    const parsed = parseTaskList("- [ ] Buy milk\n- [ ] Buy milk");
    const reconciled = reconcileParsed(duplicatedExisting, parsed);

    expect(reconciled[0].localId).toBe("existing-a");
    expect(reconciled[1].localId).toBe("existing-c");
  });
});

describe("tasksToMarkdown", () => {
  it("round-trips with parseTaskList line-for-line", () => {
    const markdown = "- [ ] Buy milk\n- [x] Ship it";
    const tasks = parseTaskList(markdown);
    expect(tasksToMarkdown(tasks)).toBe(markdown);
  });

  it("emits - [x] for checked tasks", () => {
    const tasks = [{ localId: "t", notionPageId: null, title: "Done", isChecked: true, accumulatedMinutes: 0 }];
    expect(tasksToMarkdown(tasks)).toBe("- [x] Done");
  });

  it("returns an empty string for no tasks", () => {
    expect(tasksToMarkdown([])).toBe("");
  });
});
