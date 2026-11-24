import { describe, it, expect } from "vitest";
import { parseNotionQueryResponse } from "./notion";

const response = (pages: unknown[]) => ({ results: pages });

const page = (overrides: Record<string, unknown> = {}) => ({
  id: "page-1",
  properties: {
    Task: { title: [{ plain_text: "Buy milk" }] },
    Status: { status: { name: "To Do" } },
    "Time (Min)": { number: 0 },
  },
  ...overrides,
});

describe("parseNotionQueryResponse", () => {
  it("maps Notion pages to tasks with localId equal to notionPageId", () => {
    const tasks = parseNotionQueryResponse(response([page()]));

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      localId: "page-1",
      notionPageId: "page-1",
      title: "Buy milk",
      isChecked: false,
      accumulatedMinutes: 0,
    });
  });

  it("excludes pages whose Status is Done", () => {
    const done = page({
      id: "page-done",
      properties: {
        Task: { title: [{ plain_text: "Old task" }] },
        Status: { status: { name: "Done" } },
        "Time (Min)": { number: 10 },
      },
    });

    expect(parseNotionQueryResponse(response([done]))).toHaveLength(0);
  });

  it("seeds accumulatedMinutes from a pre-existing non-zero Time (Min)", () => {
    const withTime = page({
      properties: {
        Task: { title: [{ plain_text: "Long task" }] },
        Status: { status: { name: "In Progress" } },
        "Time (Min)": { number: 45 },
      },
    });

    expect(parseNotionQueryResponse(response([withTime]))[0].accumulatedMinutes).toBe(45);
  });

  it("parses every task from a merged multi-page Notion response", () => {
    const tasks = parseNotionQueryResponse(
      response([
        page({
          id: "page-1",
          properties: {
            Task: { title: [{ plain_text: "Buy milk" }] },
            Status: { status: { name: "To Do" } },
            "Time (Min)": { number: 0 },
          },
        }),
        page({
          id: "page-2",
          properties: {
            Task: { title: [{ plain_text: "Walk dog" }] },
            Status: { status: { name: "In Progress" } },
            "Time (Min)": { number: 30 },
          },
        }),
      ]),
    );

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.notionPageId)).toEqual([
      "page-1",
      "page-2",
    ]);
  });

  it("excludes Done tasks from a merged multi-page Notion response", () => {
    const tasks = parseNotionQueryResponse(
      response([
        page({
          id: "page-1",
          properties: {
            Task: { title: [{ plain_text: "Buy milk" }] },
            Status: { status: { name: "To Do" } },
            "Time (Min)": { number: 0 },
          },
        }),
        page({
          id: "page-done",
          properties: {
            Task: { title: [{ plain_text: "Old task" }] },
            Status: { status: { name: "Done" } },
            "Time (Min)": { number: 10 },
          },
        }),
      ]),
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Buy milk");
  });
});
