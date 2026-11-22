import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTaskList, TASKS_KEY } from "./useTaskList";
import type { Task } from "../lib/tasks";

const baseTasks: Task[] = [
  { localId: "a", notionPageId: null, title: "Buy milk", isChecked: false, accumulatedMinutes: 0 },
  { localId: "b", notionPageId: "page-2", title: "Ship it", isChecked: true, accumulatedMinutes: 12 },
];

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe("useTaskList", () => {
  it("parses pasted markdown into tasks", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] Buy milk\n- [x] Ship it"));

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks[0]).toMatchObject({ title: "Buy milk", isChecked: false });
    expect(result.current.tasks[1]).toMatchObject({ title: "Ship it", isChecked: true });
  });

  it("adds tasks from pasted markdown", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] New task"));

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe("New task");
  });

  it("toggles a task by localId", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] Task"));
    const taskId = result.current.tasks[0].localId;

    act(() => result.current.toggleTask(taskId));
    expect(result.current.tasks[0].isChecked).toBe(true);

    act(() => result.current.toggleTask(taskId));
    expect(result.current.tasks[0].isChecked).toBe(false);
  });

  it("assigns accumulated minutes to a task", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] Task"));
    const taskId = result.current.tasks[0].localId;

    act(() => result.current.assignAccumulatedMinutes(taskId, 25));

    expect(result.current.tasks[0].accumulatedMinutes).toBe(25);
  });

  it("adds a single typed task with an auto-generated id", () => {
    const { result } = renderHook(() => useTaskList());

    act(() => result.current.addSingleTask("Quick note"));

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({
      title: "Quick note",
      isChecked: false,
      accumulatedMinutes: 0,
      notionPageId: null,
    });
    expect(typeof result.current.tasks[0].localId).toBe("string");
  });

  it("adds a single typed task with an explicit localId", () => {
    const { result } = renderHook(() => useTaskList());

    act(() => result.current.addSingleTask("Quick note", "custom-id"));

    expect(result.current.tasks[0].localId).toBe("custom-id");
  });

  it("ignores empty quick-add titles", () => {
    const { result } = renderHook(() => useTaskList());

    act(() => result.current.addSingleTask("   "));

    expect(result.current.tasks).toHaveLength(0);
  });

  it("renames a task by localId", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] Task"));
    const taskId = result.current.tasks[0].localId;

    act(() => result.current.renameTask(taskId, "  Renamed  "));

    expect(result.current.tasks[0].title).toBe("Renamed");
  });

  it("renameTask ignores whitespace-only titles", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] Task"));
    const taskId = result.current.tasks[0].localId;
    const before = result.current.tasks[0];

    act(() => result.current.renameTask(taskId, "   "));
    act(() => result.current.renameTask(taskId, ""));

    expect(result.current.tasks[0]).toBe(before);
    expect(result.current.tasks[0].title).toBe("Task");
  });

  it("removes a task by localId", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] A\n- [ ] B"));
    act(() => result.current.removeTask(result.current.tasks[0].localId));

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe("B");
  });

  it("initializes tasks from localStorage", () => {
    localStorage.setItem(TASKS_KEY, JSON.stringify(baseTasks));

    const { result } = renderHook(() => useTaskList());

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks[0]).toMatchObject({ localId: "a", title: "Buy milk", accumulatedMinutes: 0 });
    expect(result.current.tasks[1]).toMatchObject({ notionPageId: "page-2", isChecked: true });
  });

  it("falls back to an empty list for malformed JSON in storage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(TASKS_KEY, "{ not valid json ");

    const { result } = renderHook(() => useTaskList());

    expect(result.current.tasks).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it("persists the task list to localStorage on every change", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] Task"));
    act(() => result.current.addSingleTask("Second"));

    expect(JSON.parse(localStorage.getItem(TASKS_KEY)!)).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(TASKS_KEY)!)[1].title).toBe("Second");

    act(() => result.current.removeTask(result.current.tasks[0].localId));
    expect(JSON.parse(localStorage.getItem(TASKS_KEY)!)).toHaveLength(1);
  });

  it("mergeFetched updates only the title of notion-matched local tasks", () => {
    localStorage.setItem(
      TASKS_KEY,
      JSON.stringify([
        { localId: "a", notionPageId: "page-2", title: "Local task", isChecked: false, accumulatedMinutes: 5 },
      ])
    );
    const { result } = renderHook(() => useTaskList());

    const fetched: Task[] = [
      { localId: "page-2", notionPageId: "page-2", title: "Renamed title", isChecked: false, accumulatedMinutes: 99 },
    ];
    act(() => result.current.mergeFetched(fetched));

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe("Renamed title");
    expect(result.current.tasks[0].accumulatedMinutes).toBe(5);
    expect(result.current.tasks[0].isChecked).toBe(false);
  });

  it("mergeFetched appends fetched-only tasks and keeps local-only tasks", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] Local task"));

    const fetched: Task[] = [
      { localId: "page-1", notionPageId: "page-1", title: "Fetched task", isChecked: false, accumulatedMinutes: 3 },
    ];
    act(() => result.current.mergeFetched(fetched));

    expect(result.current.tasks.map((t) => t.title)).toEqual(["Local task", "Fetched task"]);
  });

  it("applyPageIds links local tasks to pages created in Notion", () => {
    localStorage.setItem(
      TASKS_KEY,
      JSON.stringify([
        { localId: "a", notionPageId: null, title: "A", isChecked: false, accumulatedMinutes: 0 },
        { localId: "b", notionPageId: "old-page", title: "B", isChecked: false, accumulatedMinutes: 0 },
      ])
    );
    const { result } = renderHook(() => useTaskList());

    act(() =>
      result.current.applyPageIds([
        { localId: "a", pageId: "P1" },
        { localId: "b", pageId: "P2" },
        { localId: "unknown", pageId: "P3" },
      ])
    );

    expect(result.current.tasks[0].notionPageId).toBe("P1");
    expect(result.current.tasks[1].notionPageId).toBe("old-page");
    expect(result.current.tasks).toHaveLength(2);
  });

  it("addTaskList re-parse preserves localId for title-matched rows", () => {
    const { result } = renderHook(() => useTaskList());
    act(() => result.current.addTaskList("- [ ] Buy milk"));
    const id = result.current.tasks[0].localId;

    act(() => result.current.addTaskList("- [ ] Buy milk"));

    expect(result.current.tasks[0].localId).toBe(id);
  });
});
