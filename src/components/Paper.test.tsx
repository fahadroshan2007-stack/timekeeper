import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Paper from "./Paper";
import type { Task } from "../lib/tasks";

const task = (overrides: Partial<Task> = {}): Task => ({
  localId: "t1",
  notionPageId: null,
  title: "Buy milk",
  isChecked: false,
  accumulatedMinutes: 0,
  ...overrides,
});

const defaultProps = {
  markdown: "",
  onMarkdownChange: () => {},
  showInput: false,
  tasks: [] as Task[],
  vanishingTasks: [] as Task[],
  activeTaskId: null,
  onToggleTask: () => {},
  onActivateTask: () => {},
  onRenameTask: () => {},
  onDeleteTask: () => {},
  onLoad: () => {},
  onEdit: () => {},
  onRefresh: () => {},
  onQuickAdd: () => {},
};

beforeEach(() => {
  cleanup();
});

describe("Paper inline editing", () => {
  it("shows an edit input on double-click of the task title", () => {
    render(<Paper {...defaultProps} tasks={[task()]} />);
    fireEvent.doubleClick(screen.getByText("Buy milk"));

    expect(screen.getByTestId("task-edit-input")).toBeTruthy();
    expect((screen.getByTestId("task-edit-input") as HTMLInputElement).value).toBe("Buy milk");
  });

  it("commits a trimmed rename on Enter and closes the input", () => {
    const onRenameTask = vi.fn();
    render(<Paper {...defaultProps} tasks={[task()]} onRenameTask={onRenameTask} />);
    fireEvent.doubleClick(screen.getByText("Buy milk"));
    const input = screen.getByTestId("task-edit-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Buy oat milk  " } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onRenameTask).toHaveBeenCalledTimes(1);
    expect(onRenameTask).toHaveBeenCalledWith("t1", "Buy oat milk");
    expect(screen.queryByTestId("task-edit-input")).toBeNull();
  });

  it("cancels the rename on Escape without calling onRenameTask", () => {
    const onRenameTask = vi.fn();
    render(<Paper {...defaultProps} tasks={[task()]} onRenameTask={onRenameTask} />);
    fireEvent.doubleClick(screen.getByText("Buy milk"));
    const input = screen.getByTestId("task-edit-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

    expect(onRenameTask).not.toHaveBeenCalled();
    expect(screen.queryByTestId("task-edit-input")).toBeNull();
  });

  it("commits the rename on blur", () => {
    const onRenameTask = vi.fn();
    render(<Paper {...defaultProps} tasks={[task()]} onRenameTask={onRenameTask} />);
    fireEvent.doubleClick(screen.getByText("Buy milk"));
    const input = screen.getByTestId("task-edit-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New title" } });
    fireEvent.blur(input);

    expect(onRenameTask).toHaveBeenCalledWith("t1", "New title");
  });

  it("does not commit a blank rename", () => {
    const onRenameTask = vi.fn();
    render(<Paper {...defaultProps} tasks={[task()]} onRenameTask={onRenameTask} />);
    fireEvent.doubleClick(screen.getByText("Buy milk"));
    const input = screen.getByTestId("task-edit-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onRenameTask).not.toHaveBeenCalled();
  });

  it("only allows one row to be edited at a time", () => {
    const tasks = [task({ localId: "t1", title: "A" }), task({ localId: "t2", title: "B" })];
    render(<Paper {...defaultProps} tasks={tasks} />);
    fireEvent.doubleClick(screen.getByText("A"));
    fireEvent.doubleClick(screen.getByText("B"));

    expect(screen.getAllByTestId("task-edit-input")).toHaveLength(1);
  });

  it("calls onDeleteTask with the task id on the delete button click", () => {
    const onDeleteTask = vi.fn();
    render(<Paper {...defaultProps} tasks={[task()]} onDeleteTask={onDeleteTask} />);
    const deleteBtn = screen.getByLabelText("Delete task");

    fireEvent.click(deleteBtn);

    expect(onDeleteTask).toHaveBeenCalledWith("t1");
  });

  it("renders vanishing tasks with the is-logging class and a checkmark", () => {
    const vanishing = [task({ localId: "v1", title: "Done task", isChecked: true })];
    const { container } = render(<Paper {...defaultProps} vanishingTasks={vanishing} />);

    const row = container.querySelector(".task-row.is-logging");
    expect(row).toBeTruthy();
    expect(row?.textContent).toContain("Done task");
    expect(row?.textContent).toContain("✓");
  });
});
