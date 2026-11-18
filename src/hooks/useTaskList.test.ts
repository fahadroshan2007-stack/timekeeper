import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTaskList } from "./useTaskList";

describe("useTaskList", () => {
  it("parses initial markdown into tasks", () => {
    const { result } = renderHook(() => useTaskList("- [ ] Buy milk\n- [x] Ship it"));

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks[0]).toMatchObject({ title: "Buy milk", isChecked: false });
    expect(result.current.tasks[1]).toMatchObject({ title: "Ship it", isChecked: true });
  });

  it("adds tasks from pasted markdown", () => {
    const { result } = renderHook(() => useTaskList(""));
    act(() => result.current.addTaskList("- [ ] New task"));

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe("New task");
  });

  it("toggles a task by localId", () => {
    const { result } = renderHook(() => useTaskList("- [ ] Task"));
    const taskId = result.current.tasks[0].localId;

    act(() => result.current.toggleTask(taskId));
    expect(result.current.tasks[0].isChecked).toBe(true);

    act(() => result.current.toggleTask(taskId));
    expect(result.current.tasks[0].isChecked).toBe(false);
  });

  it("assigns accumulated minutes to a task", () => {
    const { result } = renderHook(() => useTaskList("- [ ] Task"));
    const taskId = result.current.tasks[0].localId;

    act(() => result.current.assignAccumulatedMinutes(taskId, 25));

    expect(result.current.tasks[0].accumulatedMinutes).toBe(25);
  });

  it("merges fetched Notion tasks while preserving local unsynced tasks", () => {
    const { result } = renderHook(() => useTaskList("- [ ] Local task"));
    const fetched = [
      { localId: "page-1", notionPageId: "page-1", title: "Fetched", isChecked: false, accumulatedMinutes: 12 },
    ];

    act(() => result.current.mergeFetched(fetched));

    expect(result.current.tasks.map((t) => t.title)).toEqual(["Local task", "Fetched"]);
    expect(result.current.tasks[1]).toMatchObject({
      notionPageId: "page-1",
      accumulatedMinutes: 12,
    });
  });

  it("removes a task by localId", () => {
    const { result } = renderHook(() => useTaskList("- [ ] A\n- [ ] B"));
    act(() => result.current.removeTask(result.current.tasks[0].localId));

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe("B");
  });
});
