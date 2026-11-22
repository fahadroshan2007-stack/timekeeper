import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import App from "./App";

const invoke = vi.fn();
const openUrl = vi.fn().mockResolvedValue(undefined);
const startDragging = vi.fn().mockResolvedValue(undefined);
const minimize = vi.fn().mockResolvedValue(undefined);
const close = vi.fn().mockResolvedValue(undefined);
const destroy = vi.fn().mockResolvedValue(undefined);

type CloseRequestHandler = (event: { preventDefault: () => void }) => Promise<void> | void;
const closeRequestHandlers: CloseRequestHandler[] = [];

const onCloseRequested = vi.fn((handler: CloseRequestHandler) => {
  closeRequestHandlers.push(handler);
  return Promise.resolve(() => {});
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging, minimize, close, onCloseRequested, destroy }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrl(url),
}));

const setCreds = (dbId = "test-db") => {
  localStorage.setItem("timekeeper.notion.apiKey", "test-key");
  localStorage.setItem("timekeeper.notion.databaseId", dbId);
};

describe("App (integration)", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    invoke.mockReset();
    openUrl.mockReset();
    openUrl.mockResolvedValue(undefined);
    startDragging.mockClear();
    minimize.mockClear();
    close.mockClear();
    destroy.mockClear();
    onCloseRequested.mockClear();
    closeRequestHandlers.length = 0;
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "notion_query_incomplete") return Promise.resolve({ results: [] });
      if (cmd === "notion_flush_ops") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
  });

  afterEach(() => cleanup());

  it("renders the typewriter: paper, chassis, LCD and NOTION key", () => {
    render(<App />);

    expect(screen.getByTestId("paper")).toBeTruthy();
    expect(screen.getByTestId("chassis")).toBeTruthy();
    expect(screen.getByTestId("lcd-display")).toBeTruthy();
    expect(screen.getByTestId("key-notion")).toBeTruthy();
    expect(screen.queryByTestId("key-log")).toBeNull();
  });

  it("parses pasted markdown into an interactive checklist", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("key-edit"));
    fireEvent.change(screen.getByTestId("paper-input"), {
      target: { value: "- [ ] Buy milk\n- [ ] Write docs" },
    });
    fireEvent.click(screen.getByTestId("key-load"));

    expect(screen.getByText("Buy milk")).toBeTruthy();
    expect(screen.getByText("Write docs")).toBeTruthy();
  });

  it("renders tasks seeded in localStorage", () => {
    localStorage.setItem(
      "timekeeper.tasks.v1",
      JSON.stringify([
        {
          localId: "s1",
          notionPageId: null,
          title: "Seeded task",
          isChecked: false,
          accumulatedMinutes: 0,
        },
      ])
    );

    render(<App />);

    expect(screen.getByText("Seeded task")).toBeTruthy();
  });

  it("checking a task plays the strikethrough, removes it, and queues a done op", async () => {
    setCreds();
    localStorage.setItem(
      "timekeeper.tasks.v1",
      JSON.stringify([
        {
          localId: "page-task",
          notionPageId: "page-1",
          title: "Buy milk",
          isChecked: false,
          accumulatedMinutes: 0,
        },
      ])
    );
    render(<App />);

    const row = screen.getByText("Buy milk").closest("li");
    expect(row).toBeTruthy();
    fireEvent.click(row!.querySelector("button")!);

    expect(document.querySelector(".task-row.is-logging")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Buy milk")).toBeNull(), {
      timeout: 2000,
    });

    // A manual refresh flushes the queued done op.
    fireEvent.click(screen.getByTestId("key-refresh"));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "notion_flush_ops",
        expect.objectContaining({
          ops: expect.arrayContaining([
            expect.objectContaining({
              kind: "done",
              notionPageId: "page-1",
            }),
          ]),
        })
      );
    });
  });

  it("flushes before pulling from Notion on launch", async () => {
    setCreds();
    localStorage.setItem(
      "timekeeper.pendingOps.v1",
      JSON.stringify([
        { id: "p1", kind: "create", localId: "L", title: "Queued", attempts: 0 },
      ])
    );

    render(<App />);

    await waitFor(() =>
      expect(invoke.mock.calls.some((c) => c[0] === "notion_query_incomplete")).toBe(true)
    );
    const calls = invoke.mock.calls.map((c) => c[0]);
    const orders = invoke.mock.invocationCallOrder;
    const flushIndex = calls.indexOf("notion_flush_ops");
    const queryIndex = calls.indexOf("notion_query_incomplete");
    expect(flushIndex).toBeGreaterThan(-1);
    expect(orders[flushIndex]).toBeLessThan(orders[queryIndex]);
  });

  it("opens the Notion database with the id dashes stripped", () => {
    setCreds("abcd-1234");
    render(<App />);

    fireEvent.click(screen.getByTestId("key-notion"));

    expect(openUrl).toHaveBeenCalledWith("https://www.notion.so/abcd1234");
  });

  it("links a quick-added task to its Notion page so a later pull doesn't duplicate it", async () => {
    setCreds();
    let created = false;
    invoke.mockImplementation(
      (cmd: string, args?: { ops?: { opIds?: string[] }[] }) => {
        if (cmd === "notion_query_incomplete") {
          if (!created) return Promise.resolve({ results: [] });
          return Promise.resolve({
            results: [
              {
                id: "new-page",
                properties: {
                  Task: { title: [{ plain_text: "Fresh task" }] },
                  Status: { status: { name: "Not Started" } },
                },
              },
            ],
          });
        }
        if (cmd === "notion_flush_ops") {
          created = true;
          return Promise.resolve([
            { opIds: args?.ops?.[0]?.opIds ?? [], ok: true, pageId: "new-page" },
          ]);
        }
        return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
      }
    );

    render(<App />);
    const input = screen.getByTestId("paper-quickadd");
    fireEvent.change(input, { target: { value: "Fresh task" } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.click(screen.getByTestId("key-refresh"));

    // The toast is shown after the fetched page has been merged into the list.
    await waitFor(() => {
      expect(screen.getByTestId("toast").textContent).toContain("Synced 1 task(s)");
    });
    expect(screen.getAllByText("Fresh task")).toHaveLength(1);
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

  it("quick-add enqueues a createProgress op via the debounced flush", async () => {
    setCreds();
    render(<App />);

    const input = screen.getByTestId("paper-quickadd");
    fireEvent.change(input, { target: { value: "Fresh task" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(
      () => {
        expect(invoke).toHaveBeenCalledWith(
          "notion_flush_ops",
          expect.objectContaining({
            ops: [
              expect.objectContaining({
                kind: "createProgress",
                status: "Not Started",
                accumulatedMinutes: 0,
              }),
            ],
          })
        );
      },
      { timeout: 4000 }
    );
  });

  it("checking a task enqueues a done op and sweeps undone tasks into progress ops", async () => {
    setCreds();
    localStorage.setItem(
      "timekeeper.tasks.v1",
      JSON.stringify([
        {
          localId: "task-1",
          notionPageId: "page-1",
          title: "Buy milk",
          isChecked: false,
          accumulatedMinutes: 0,
        },
        {
          localId: "task-2",
          notionPageId: "page-2",
          title: "Write docs",
          isChecked: false,
          accumulatedMinutes: 25,
        },
      ])
    );

    render(<App />);

    const row = screen.getByText("Buy milk").closest("li");
    expect(row).toBeTruthy();
    fireEvent.click(row!.querySelector("button")!);

    await waitFor(
      () => {
        expect(invoke).toHaveBeenCalledWith(
          "notion_flush_ops",
          expect.objectContaining({
            ops: expect.arrayContaining([
              expect.objectContaining({ kind: "done", localId: "task-1", notionPageId: "page-1" }),
              expect.objectContaining({
                kind: "progress",
                localId: "task-2",
                notionPageId: "page-2",
                status: "In Progress",
                accumulatedMinutes: 25,
              }),
            ]),
          })
        );
      },
      { timeout: 4000 }
    );
  });

  it("assigning a session sweeps the task into a progress op", async () => {
    vi.useFakeTimers();
    try {
      setCreds();
      localStorage.setItem(
        "timekeeper.tasks.v1",
        JSON.stringify([
          {
            localId: "task-1",
            notionPageId: "page-1",
            title: "Buy milk",
            isChecked: false,
            accumulatedMinutes: 0,
          },
        ])
      );

      render(<App />);

      fireEvent.click(screen.getByTestId("mode-stopwatch"));
      fireEvent.click(screen.getByTestId("tk-start"));
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      fireEvent.click(screen.getByTestId("tk-stop-reset"));

      expect(screen.getByTestId("session-end-prompt")).toBeTruthy();
      fireEvent.click(screen.getByTestId("session-save"));

      // Let the ~1 s flush debounce elapse, then the debounced flush runs.
      act(() => {
        vi.advanceTimersByTime(1_100);
      });

      expect(invoke).toHaveBeenCalledWith(
        "notion_flush_ops",
        expect.objectContaining({
          ops: [
            expect.objectContaining({
              kind: "progress",
              localId: "task-1",
              status: "In Progress",
              accumulatedMinutes: 1,
            }),
          ],
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes queued ops when the browser regains connectivity", async () => {
    setCreds();
    localStorage.setItem(
      "timekeeper.tasks.v1",
      JSON.stringify([
        {
          localId: "task-1",
          notionPageId: "page-1",
          title: "Buy milk",
          isChecked: false,
          accumulatedMinutes: 0,
        },
      ])
    );

    render(<App />);

    // Check the task so a done op lands in the queue.
    const row = screen.getByText("Buy milk").closest("li");
    expect(row).toBeTruthy();
    fireEvent.click(row!.querySelector("button")!);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(
      () => {
        expect(invoke).toHaveBeenCalledWith(
          "notion_flush_ops",
          expect.objectContaining({
            ops: [expect.objectContaining({ kind: "done" })],
          })
        );
      },
      { timeout: 4000 }
    );
  });

  it("flushes queued ops and destroys the window on close request", async () => {
    setCreds();
    localStorage.setItem(
      "timekeeper.pendingOps.v1",
      JSON.stringify([
        { id: "p1", kind: "done", localId: "L", notionPageId: "P", title: "A", accumulatedMinutes: 5, attempts: 0 },
      ])
    );

    render(<App />);

    await waitFor(() => expect(closeRequestHandlers.length).toBeGreaterThan(0));
    invoke.mockClear();

    const handler = closeRequestHandlers[closeRequestHandlers.length - 1];
    const preventDefault = vi.fn();
    await act(async () => {
      await handler({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith(
      "notion_flush_ops",
      expect.objectContaining({
        ops: [expect.objectContaining({ kind: "done" })],
      })
    );
    await waitFor(() => expect(destroy).toHaveBeenCalled());
  });

  it("closes the window even when the final flush fails", async () => {
    setCreds();
    localStorage.setItem(
      "timekeeper.pendingOps.v1",
      JSON.stringify([
        { id: "p1", kind: "done", localId: "L", notionPageId: "P", title: "A", accumulatedMinutes: 5, attempts: 0 },
      ])
    );
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "notion_flush_ops") return Promise.reject(new Error("notion down"));
      if (cmd === "notion_query_incomplete") return Promise.resolve({ results: [] });
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    render(<App />);

    await waitFor(() => expect(closeRequestHandlers.length).toBeGreaterThan(0));
    invoke.mockClear();

    const handler = closeRequestHandlers[closeRequestHandlers.length - 1];
    const preventDefault = vi.fn();
    await act(async () => {
      await handler({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalled();
    await waitFor(() => expect(destroy).toHaveBeenCalled());
  });

  it("does not create a periodic flush interval", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    render(<App />);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });
});
