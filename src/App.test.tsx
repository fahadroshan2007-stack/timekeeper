import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "./App";

const invoke = vi.fn();
const startDragging = vi.fn().mockResolvedValue(undefined);
const minimize = vi.fn().mockResolvedValue(undefined);
const close = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging, minimize, close }),
}));

describe("App (integration)", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    invoke.mockReset();
    startDragging.mockClear();
    minimize.mockClear();
    close.mockClear();
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "notion_query_incomplete") return Promise.resolve({ results: [] });
      if (cmd === "notion_log_batch") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
  });

  afterEach(() => cleanup());

  it("renders the typewriter: paper, chassis, LCD and LOG key", () => {
    render(<App />);

    expect(screen.getByTestId("paper")).toBeTruthy();
    expect(screen.getByTestId("chassis")).toBeTruthy();
    expect(screen.getByTestId("lcd-display")).toBeTruthy();
    expect(screen.getByTestId("key-log")).toBeTruthy();
  });

  it("parses pasted markdown into an interactive checklist", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("paper-input"), {
      target: { value: "- [ ] Buy milk\n- [ ] Write docs" },
    });
    fireEvent.click(screen.getByTestId("key-load"));

    expect(screen.getByText("Buy milk")).toBeTruthy();
    expect(screen.getByText("Write docs")).toBeTruthy();
  });

  it("toggles a task checked when its checkbox is clicked", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("paper-input"), {
      target: { value: "- [ ] Buy milk" },
    });
    fireEvent.click(screen.getByTestId("key-load"));

    const row = screen.getByText("Buy milk").closest("li");
    expect(row).toBeTruthy();
    fireEvent.click(row!.querySelector("button")!);

    expect(row!.getAttribute("data-checked")).toBe("true");
  });

  it("toggles the Noir & Brass (late-night) theme on the widget root", () => {
    render(<App />);

    const root = document.querySelector(".typewriter-widget");
    expect(root?.getAttribute("data-theme")).toBe("espresso");

    fireEvent.click(screen.getByTestId("key-theme"));
    expect(document.querySelector(".typewriter-widget")?.getAttribute("data-theme")).toBe(
      "late"
    );
    expect(localStorage.getItem("timekeeper.theme")).toBe("late");

    fireEvent.click(screen.getByTestId("key-theme"));
    expect(document.querySelector(".typewriter-widget")?.getAttribute("data-theme")).toBe(
      "espresso"
    );
  });

  it("closes the window when the close key is pressed", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("key-close"));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("minimizes the window when the minimize key is pressed", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("key-minimize"));
    expect(minimize).toHaveBeenCalledTimes(1);
  });

  it("calls the Notion batch sync on LOG with the checked tasks", async () => {
    localStorage.setItem("timekeeper.notion.apiKey", "test-key");
    localStorage.setItem("timekeeper.notion.databaseId", "test-db");
    render(<App />);

    fireEvent.change(screen.getByTestId("paper-input"), {
      target: { value: "- [x] Done task" },
    });
    fireEvent.click(screen.getByTestId("key-load"));
    fireEvent.click(screen.getByTestId("key-log"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "notion_log_batch",
        expect.objectContaining({ tasks: expect.any(Array) })
      );
    });
  });
});
