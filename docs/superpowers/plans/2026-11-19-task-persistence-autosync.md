# Task Persistence, Inline Editing & Local-First Notion Autosync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the user's task list across restarts, edit tasks inline on the paper (rename/delete), and replace the LOG button with an automatic local-first Notion sync batched every 30 s.

**Architecture:** Tasks live in localStorage (write-through on every state change). All Notion traffic goes through a persisted queue of pending ops (`timekeeper.pendingOps.v1`); a flush engine coalesces ops per task, pushes them in one `notion_flush_ops` invoke, and reconciles page ids on success. The paper UI never waits on the network. Checked tasks vanish optimistically; Notion catches up in batches.

**Tech Stack:** React 19 + TypeScript + Tailwind v4, Tauri v2, Rust (`reqwest`) commands, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-11-19-task-persistence-and-inline-edit-design.md`

## Global Constraints

- localStorage keys are exactly: `timekeeper.tasks.v1`, `timekeeper.markdown.v1`, `timekeeper.pendingOps.v1`.
- Flush interval: 30 s. Flush runs at launch and on manual ↻; skipped silently when credentials are missing or `navigator.onLine === false`.
- Notion page "delete" = `archived: true` (trash). Creates omit Status (DB default "Not Started" applies).
- No new dependencies — `@tauri-apps/plugin-opener` and `tauri-plugin-opener` are already present.
- The window stays 220×220; no layout restructuring. Reuse existing CSS classes (`is-logging`, `font-typewriter`, `paper-btn`, `tw-key-red`).
- TDD throughout: failing test first, then implementation, commit per task.
- `npm test` must stay green at every task boundary. `git status` must not pick up `Versions/` (untracked, not ours).

## Review Focus

The five inputs most likely to break this in the user's hands — each pinned to a task's tests:

1. **Offline check → restart → launch re-fetches the still-Notion page** (page backing a queued `done` op must not resurrect) → Task 2 (`filterFetched(fetched, ops)`) + Task 9 (App integration: launch does flush → pull, filtered).
2. **Quick-add → rename before first flush** (rename of a pageless task must fold into the queued create, or Notion keeps the stale title) → Task 2 (`coalesceOps` fold test).
3. **Check clicked before the in-flight create's result arrives** (the vanished task's `done` op has `notionPageId: null`; flush must backfill the page id returned by the create into the queued op) → Task 2 (`applyFlushResults` backfill test).
4. **DONE (RENDER) re-parses Markdown and mints fresh `localId`s** (orphaned create-op page-id write-backs → duplicate Done pages) → Task 1 (`reconcileParsed` preserves `localId`/`notionPageId` by title).
5. **Refresh ordering** (↻ must flush before pulling, or pages backing pending ops come straight back) → Task 9 (App test asserts `notion_flush_ops` is invoked before `notion_query_incomplete` via `mock.invocationCallOrder`).

---

### Task 1: `lib/tasks.ts` — `renameTask`, `reconcileParsed`, `tasksToMarkdown`

**Files:**
- Modify: `src/lib/tasks.ts`
- Test: `src/lib/tasks.test.ts`

**Interfaces:**
- Consumes: existing `Task`, `parseTaskList`, `toggleTask`, `addAccumulatedMinutes`.
- Produces (later tasks rely on these exact signatures):
  - `renameTask(task: Task, title: string): Task` — trimmed title; whitespace/empty title returns `task` unchanged (same reference).
  - `reconcileParsed(existing: Task[], parsed: Task[]): Task[]` — for each parsed task in order, first unused existing task with the same title matches; matched keeps `localId`, `notionPageId`, `accumulatedMinutes` from existing; unmatched keeps parsed values.
  - `tasksToMarkdown(tasks: Task[]): string` — one `- [ ]` / `- [x]` line per task (checked marker from `isChecked`), joined by `\n`; `[]` → `""`.

- [ ] **Step 1: Write the failing tests** (append to `src/lib/tasks.test.ts`)

```ts
import { renameTask, reconcileParsed, tasksToMarkdown, parseTaskList } from "./tasks";
// renameTask:
//   - "renameTask trims and applies the new title"
//   - "renameTask returns the same task object for whitespace-only titles"
// reconcileParsed:
//   - "reconcileParsed preserves localId and notionPageId by title match"
//   - "reconcileParsed keeps accumulatedMinutes of matched tasks"
//   - "reconcileParsed assigns fresh ids to unmatched parsed tasks"
//   - "reconcileParsed is stable when titles are duplicated (first unmatched wins)"
// tasksToMarkdown:
//   - "tasksToMarkdown round-trips with parseTaskList line-for-line"
//   - "tasksToMarkdown emits - [x] for checked tasks"
//   - "tasksToMarkdown returns an empty string for no tasks"
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/tasks.test.ts` — Expected: FAIL (imports undefined).

- [ ] **Step 3: Implement** the three functions per the Interfaces block. `reconcileParsed` algorithm: track a `used` set of existing indexes; per parsed task, find first existing index not used with equal `title`; build result preserving matched fields.

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/tasks.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks.ts src/lib/tasks.test.ts
git commit -m "feat: renameTask, reconcileParsed, tasksToMarkdown in task lib"
```

---

### Task 2: `src/lib/sync.ts` — op types, `coalesceOps`, `applyFlushResults`, `filterFetched`

**Files:**
- Create: `src/lib/sync.ts`
- Test: `src/lib/sync.test.ts`

**Interfaces:**
- Consumes: nothing (pure module; `Task` type from `./tasks` for `filterFetched`).
- Produces (later tasks rely on exact shapes — Rust command mirrors these):

```ts
export type PendingOp =
  | { id: string; kind: "create"; localId: string; title: string; attempts: number }
  | { id: string; kind: "done"; localId: string; notionPageId: string | null; title: string; accumulatedMinutes: number; attempts: number }
  | { id: string; kind: "rename"; localId: string; notionPageId: string | null; title: string; attempts: number }
  | { id: string; kind: "trash"; localId: string; notionPageId: string | null; attempts: number };

export type WireOp =
  | { opIds: string[]; kind: "create"; localId: string; title: string }
  | { opIds: string[]; kind: "createDone"; localId: string; title: string; accumulatedMinutes: number }
  | { opIds: string[]; kind: "done"; localId: string; notionPageId: string; accumulatedMinutes: number }
  | { opIds: string[]; kind: "rename"; notionPageId: string; title: string }
  | { opIds: string[]; kind: "trash"; notionPageId: string };

export interface OpResult { opIds: string[]; ok: boolean; error?: string; pageId?: string }

export function coalesceOps(ops: PendingOp[]): WireOp[]
export function applyFlushResults(ops: PendingOp[], results: OpResult[]): PendingOp[]
export function filterFetched(fetched: import("./tasks").Task[], ops: PendingOp[]): import("./tasks").Task[]
```

`coalesceOps` rules (spec-table, extended in review): group by `localId`, groups in first-appearance order; per group:
- create + rename ops ⇒ create with the last rename title; rename folded in.
- create + done ⇒ single `createDone` (final title, done's minutes); rename folded the same way.
- create + done + trash ⇒ **all dropped** (page never existed).
- create + trash ⇒ all dropped.
- no create: `done` with `notionPageId: null` ⇒ `createDone` (the task never reached Notion — create it directly as Done); date renders `- [x]` edge covered here.
- no create: `rename` with `notionPageId: null` ⇒ dropped. `trash` with `notionPageId: null` ⇒ dropped. `done` with page id ⇒ wire `done`.
- `rename` + `done` (no create, page id known) ⇒ both wire ops (rename owns title; done owns Status/minutes).
- Emit order across the queue: creates/createDones first, then dones, then renames, then trashes.
- Each wire op carries `opIds` = ids of all source ops folded into it.

`applyFlushResults` rules:
- On `ok` for a `create`/`createDone` carrying `pageId`: backfill `notionPageId` into every remaining op with the same `localId` and `notionPageId == null`.
- On `ok`: retire (delete) the source ops listed in the result's `opIds`.
- On failure: keep source ops, `attempts += 1`.
- Whole-call failure (throw) is handled by the caller; this function only maps results.

`filterFetched`: drops fetched tasks whose `notionPageId` appears in any queued `done` or `trash` op (they are checked-but-unflushed or deleted).

- [ ] **Step 1: Write the failing tests** in `src/lib/sync.test.ts`. Must cover at minimum: create→rename fold; create→done→trash ⇒ empty; create→trash ⇒ empty; createDone happy path from `[create, done]`; `done`(null pageId, no create) ⇒ createDone; rename(null, no create) ⇒ dropped; done+rename with page id ⇒ both wire ops; op order (create before done before rename before trash); `applyFlushResults` retires succeeded ops, increments `attempts` on failures, backfills `pageId` into queued `done`/`rename`/`trash` ops of the same `localId`; `filterFetched` drops a page backing a queued `done` and one backing a `trash`, keeps others.

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/sync.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `src/lib/sync.ts` to the rules above.

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/sync.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts
git commit -m "feat: pending-op sync engine (coalesce, flush results, fetch filter)"
```

---

### Task 3: `useTaskList` — storage init/persist, `renameTask`, `mergeFetched` dedupe

**Files:**
- Modify: `src/hooks/useTaskList.ts`
- Test: `src/hooks/useTaskList.test.ts`

**Interfaces:**
- Consumes (Task 1): `renameTask` from `../lib/tasks`; storage keys from constants (define module-level `TASKS_KEY = "timekeeper.tasks.v1"`).
- Produces:
  - `useTaskList(): UseTaskListResult` — **no argument**; initial state read from `timekeeper.tasks.v1` (malformed JSON → `[]` + `console.warn`); persisted to the same key via `useEffect` on every `tasks` change.
  - new result member `renameTask: (taskId: string, title: string) => void` — applies only for valid (non-blank) trimmed titles.
  - `addSingleTask: (title: string, localId?: string) => void` — accepts an optional explicit `localId` (App passes its own UUID so it can enqueue a matching `create` op in one step).
  - `addTaskList(markdown: string): void` — parses via `parseTaskList`, then `reconcileParsed(prev, parsed)` before setting (id/page-id stability).
  - `mergeFetched(fetched: Task[]): void` — dedupe by `notionPageId`: a fetched page matching a stored task updates **title only** (preserves local `isChecked`, `accumulatedMinutes`); fetched-only tasks appended; local `notionPageId === null` tasks untouched.
  - `initialMarkdown` parameter removed (breaking — App call site updated in Task 8; hook tests updated here).

- [ ] **Step 1: Update hook tests** (`useTaskList.test.ts`): add `beforeEach(() => localStorage.clear())`; rewrite `useTaskList("…")` calls to seed via `useTaskList()` + `addTaskList("…")` (paste path), or seed `timekeeper.tasks.v1` directly for persistence tests. New tests: init from storage; malformed JSON → empty + warn; persisted on every change (add/check/remove); `renameTask` applies/commits and ignores whitespace-only; `addSingleTask` accepts an explicit `localId` and uses it; `addTaskList` preserves `localId`/`notionPageId` across re-parse for title-matched rows (call twice with same markdown); `mergeFetched` title-only update keeps local minutes/checked; fetched-only appended.

- [ ] **Step 2: Run to verify failures** — Run: `npx vitest run src/hooks/useTaskList.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** the hook per Interfaces (keep `toggleTask`, `assignAccumulatedMinutes`, `removeTask`, `addSingleTask`, `mergeFetched` shape; add `renameTask`; init/persist storage; `mergeFetched` dedupe).

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/hooks/useTaskList.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTaskList.ts src/hooks/useTaskList.test.ts
git commit -m "feat: persist task list to localStorage, inline renameTask, fetch dedupe"
```

---

### Task 4: `usePendingOps` hook — enqueue + flush

**Files:**
- Create: `src/hooks/usePendingOps.ts`
- Test: `src/hooks/usePendingOps.test.ts`

**Interfaces:**
- Consumes (Task 2): `coalesceOps`, `applyFlushResults`, `PendingOp`, `OpResult`; `invoke` from `@tauri-apps/api/core` (mocked in tests).
- Produces:

```ts
export type EnqueueOp =
  | Omit<Extract<PendingOp, { kind: "create" }>, "id" | "attempts">
  | Omit<Extract<PendingOp, { kind: "done" }>, "id" | "attempts">
  | Omit<Extract<PendingOp, { kind: "rename" }>, "id" | "attempts">
  | Omit<Extract<PendingOp, { kind: "trash" }>, "id" | "attempts">;

export function usePendingOps(args: { apiKey: string; databaseId: string }): {
  ops: PendingOp[];
  enqueue: (op: EnqueueOp) => void;
  flush: () => Promise<{ ok: boolean; failed: number; skipped: boolean }>;
}
```

- State init from `timekeeper.pendingOps.v1` (malformed → `[]` + warn); persisted via `useEffect`.
- `enqueue`: assigns `id = crypto.randomUUID()`, `attempts = 0`; single write-through setState.
- `flush`: if `!apiKey || !databaseId || (typeof navigator !== "undefined" && navigator.onLine === false)` → `{ ok: true, failed: 0, skipped: true }` with **no invoke**. Otherwise `coalesceOps(ops)`; if empty → same skip shape. Else `invoke("notion_flush_ops", { apiKey, databaseId, ops: wire })` → `applyFlushResults`. On throw: `applyFlushResults(ops, [])` (nothing retired; optionally increment all attempts) and `{ ok: false, failed: ops.length, skipped: false }`. Returns `{ ok, failed, skipped }`.

- [ ] **Step 1: Write the failing tests** (`usePendingOps.test.ts`, mock `@tauri-apps/api/core` with `vi.mock` like `App.test.tsx`): init from storage; enqueue persists with generated id; flush with no credentials skips invoke; flush while offline skips invoke (`Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true })`); flush coalesces to one `notion_flush_ops` invoke carrying wire ops; success retires ops and backfills `pageId` into queued rename; invoke failure keeps all ops, returns `ok: false`, increments attempts.

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/hooks/usePendingOps.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** the hook.

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/hooks/usePendingOps.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePendingOps.ts src/hooks/usePendingOps.test.ts
git commit -m "feat: pending-ops queue hook with batched notion flush"
```

---

### Task 5: Rust — replace `notion_log_batch` with `notion_flush_ops`

**Files:**
- Modify: `src-tauri/src/commands/notion.rs`
- Modify: `src-tauri/src/lib.rs:9-12` (handler registration)

**Interfaces:**
- Consumes: wire-op shapes from Task 2 (serde mirror below — camelCase JSON, tag = `kind`).
- Produces: `notion_flush_ops(ops, api_key, database_id) -> Result<Vec<OpResult>, String>`.

```rust
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WireOp {
    Create { #[serde(rename = "opIds")] op_ids: Vec<String>, #[serde(rename = "localId")] local_id: String, title: String },
    CreateDone { #[serde(rename = "opIds")] op_ids: Vec<String>, #[serde(rename = "localId")] local_id: String, title: String, #[serde(rename = "accumulatedMinutes")] accumulated_minutes: i64 },
    Done { #[serde(rename = "opIds")] op_ids: Vec<String>, #[serde(rename = "localId")] local_id: String, #[serde(rename = "notionPageId")] notion_page_id: String, #[serde(rename = "accumulatedMinutes")] accumulated_minutes: i64 },
    Rename { #[serde(rename = "opIds")] op_ids: Vec<String>, #[serde(rename = "notionPageId")] notion_page_id: String, title: String },
    Trash { #[serde(rename = "opIds")] op_ids: Vec<String>, #[serde(rename = "notionPageId")] notion_page_id: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpResult { pub op_ids: Vec<String>, pub ok: bool, pub error: Option<String>, pub page_id: Option<String> }
```

Op bodies (sequential execution, continue-on-error, never `Err` for individual ops — only Ok(results)):
- `create`: POST `https://api.notion.com/v1/pages`, body `{ parent: { database_id }, properties: { Task: { title: [{ text: { content: title } }] } } }` — **no Status property**. Read `id` from JSON → `page_id`.
- `createDone`: same + `"Status": { "status": { "name": "Done" } }`, `"Time (Min)": { "number": accumulated_minutes }`, `"Logged At": { "date": { "start": now_iso() } }`. → `page_id`.
- `done`: PATCH `https://api.notion.com/v1/pages/{notion_page_id}`, properties as createDone minus Task title.
- `rename`: PATCH same path, properties `{ Task: { title: [...] } }` only.
- `trash`: PATCH same path, body `{ "archived": true }`.

Delete `NotionTaskPayload`, `notion_log_batch`. Keep `notion_query_incomplete` and `NotionSyncResult` only if still used — remove unused struct accordingly (`NotionSyncResult` was batch-only → delete). lib.rs: `notion_flush_ops` replaces `notion_log_batch` in the handler list.

- [ ] **Step 1: Rewrite `notion.rs`** per the above (keep `build_client`, `now_iso`, `response_error` helpers).
- [ ] **Step 2: Update `lib.rs` registration** (`notion_log_batch` → `notion_flush_ops`).
- [ ] **Step 3: Verify** — Run: `cd src-tauri && cargo check` — Expected: compiles without errors (warnings about unused `NotionSyncResult` are a failure — remove it).
- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/notion.rs src-tauri/src/lib.rs
git commit -m "feat: notion_flush_ops command replaces notion_log_batch"
```

---

### Task 6: `src/lib/notion.ts` — `flushOps` replaces batch sync

**Files:**
- Modify: `src/lib/notion.ts`
- Test: `src/lib/notion.test.ts`

**Interfaces:**
- Consumes (Task 2): `WireOp`, `OpResult`; (Task 5): the `notion_flush_ops` command.
- Produces: `flushOps(args: { apiKey: string; databaseId: string; ops: WireOp[] }): Promise<OpResult[]>` — thin `invoke` wrapper. `planBatchSync`, `runBatchSync`, `NotionBatchSyncArgs`, `NotionSyncAction`, `NotionSyncResult`, `NotionTaskPayload` deleted. `parseNotionQueryResponse`, `fetchIncompleteTasks` unchanged.

- [ ] **Step 1: Rewrite tests** (`notion.test.ts`): delete `planBatchSync` suite; new suite `flushOps` with `vi.mock("@tauri-apps/api/core")`: asserts invoked once with `notion_flush_ops` and the given ops/apiKey/databaseId, and returns its result. Keep `notion-fetch.test.ts` untouched (still valid).
- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/notion.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/notion.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/notion.ts src/lib/notion.test.ts
git commit -m "refactor: flushOps invoke replaces batch sync planner"
```

---

### Task 7: `Paper.tsx` — inline rename input, ✕ delete, vanish snapshots

**Files:**
- Modify: `src/components/Paper.tsx`
- Create: `src/components/Paper.test.tsx`

**Interfaces:**
- Consumes: `Task` from `../lib/tasks`.
- Produces (props contract for Task 9):

```ts
interface PaperProps {
  markdown: string; onMarkdownChange: (value: string) => void; showInput: boolean;
  tasks: Task[]; vanishingTasks: Task[];
  activeTaskId: string | null;
  onToggleTask: (taskId: string) => void;
  onActivateTask: (taskId: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onDeleteTask: (taskId: string) => void;
  onLoad: () => void; onEdit: () => void; onRefresh: () => void; onQuickAdd: (title: string) => void;
}
```

Behavior:
- Per-row ✕ button: `aria-label="Delete task"`, class `task-delete`, always visible, sits right of the time pill / row end; click calls `onDeleteTask(localId)`; click does not activate the row.
- Title is a `<button className="task-text-wrapper font-typewriter" onClick={activate} onDoubleClick={startEdit}>` — double-click swaps to `<input className="task-edit-input font-typewriter" data-testid="task-edit-input" autoFocus>` with the current title; Enter or blur commits (`onRenameTask` with the raw value — App/hook trim); Escape cancels without calling; commit of blank input does not call `onRenameTask`.
- Single `editingId` state at Paper level; starting an edit on one row cancels another.
- `vanishingTasks` render after the live rows as extra `<li className="task-row is-checked is-logging">` rows: checkbox pre-ticked "✓", title struck through, no buttons; non-interactive (pointer-events: none via CSS).
- `loggingIds` prop removed.

- [ ] **Step 1: Write the failing tests** (`Paper.test.tsx`): double-click title renders `task-edit-input` with current value; Enter commits with trimmed value and calls `onRenameTask` once, input closes; Escape closes without calling; blur commits; blank+Enter does not call; ✕ click calls `onDeleteTask` with the id; only one input at a time; vanishing tasks render with `is-logging` and a ticked checkbox.
- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/components/Paper.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the component changes above (keep quick-add form, header, DONE (RENDER) key untouched).
- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/components/Paper.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/Paper.tsx src/components/Paper.test.tsx
git commit -m "feat: inline task rename and delete on the paper"
```

---

### Task 8: CSS — `.task-delete`, `.task-edit-input`, vanish styling

**Files:**
- Modify: `src/typewriter.css` (append a section near the `.time-pill` block, ~line 468, or at end of file — match existing style conventions: CSS variables, `font-typewriter`)

**Interfaces:** none — pure styling, sized for the 220×220 paper.

- [ ] **Step 1: Add styles**: `.task-delete` — 16px tap target, transparent, `color: var(--ribbon-red)` at 60% opacity, full opacity on row hover, `font-size: 0.8rem`, no border. `.task-edit-input` — `background: transparent`, `border: none`, `border-bottom: 1px dashed var(--ribbon-red)`, inherit font, `width: 100%`, `outline: none`, same padding/size as `.task-text`. `.task-row.is-logging` — already exists (~line 1132): verify it animates the strikethrough + fade; add `pointer-events: none;` if absent.
- [ ] **Step 2: Verify build** — Run: `npm run build` (tsc + vite) — Expected: succeeds.
- [ ] **Step 3: Commit**

```bash
git add src/typewriter.css
git commit -m "style: delete and inline-edit keys for task rows"
```

---

### Task 9: Chassis — LOG key → NOTION ↗

**Files:**
- Modify: `src/components/Chassis.tsx:6,18-19,53-54,206-215` (props + key) and `src/App.test.tsx` mocks referenced later in Task 10

**Interfaces:**
- Consumes: nothing new. Produces: prop `onOpenNotion: () => void` replacing `logging: boolean; onLog: () => void`. Key: `data-testid="key-notion"`, `className="tw-key tw-key-red"`, title `"Open the Notion database"`, label `NOTION ↗`.

- [ ] **Step 1: Edit `Chassis.tsx`** — remove `logging`/`onLog` from props and destructuring; replace the LOG `<button>` block with the NOTION ↗ key calling `onOpenNotion`.
- [ ] **Step 2: Verify types** — Run: `npx tsc --noEmit` — Expected: errors only in `App.tsx` (call site not yet updated) — those are fixed in Task 10; note them, do not stub.
- [ ] **Step 3: Commit**

```bash
git add src/components/Chassis.tsx
git commit -m "feat: replace LOG key with open-Notion-database key"
```

---

### Task 10: `App.tsx` — wire persistence, vanish-on-check, flush, open-notion

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes (Tasks 1,2,3,4,6,7,9): `useTaskList` (no-arg, + `renameTask`), `usePendingOps`, `filterFetched`, `flushOps` (via hook), `openUrl` (`@tauri-apps/plugin-opener`), `tasksToMarkdown`, `parseTaskList`, `Paper` new props (`vanishingTasks`, `onRenameTask`, `onDeleteTask`), Chassis `onOpenNotion`.
- Produces: the running app.

Implementation decisions (all pinned):
- `const [markdown, setMarkdown] = useState(() => localStorage.getItem("timekeeper.markdown.v1") ?? "")`; `useEffect(() => localStorage.setItem("timekeeper.markdown.v1", markdown), [markdown])`.
- `const { tasks, addTaskList, toggleTask, assignAccumulatedMinutes, removeTask, mergeFetched, addSingleTask, renameTask } = useTaskList();`
- `const { ops, enqueue, flush } = usePendingOps({ apiKey, databaseId });` `const opsRef = useRef(ops); opsRef.current = ops;`
- `const flushNow = useCallback(async () => flush(), [flush]);`
- Launch (extends existing `didLoad` effect): if `apiKey && databaseId` — `flushNow()` **then** `refreshFromNotion(apiKey, databaseId, false)`.
- Refresh ↻ handler: `async (key, dbId, announce)` — if creds: `const r = await flushNow();` `if (!r.ok && announce) showToast("SYNC FAILED — WILL RETRY");` then existing fetch flow, but **filter the merge**: `const pendingIds = new Set(opsRef.current.filter(o => (o.kind === "done" || o.kind === "trash") && o.notionPageId).map(o => o.notionPageId));` `mergeFetched(filterFetched(fetched, opsRef.current));` `filterFetched` already does this — use it directly, drop manual set.
- 30 s interval: `useEffect(() => { const id = window.setInterval(() => { void flushNow(); }, 30000); return () => window.clearInterval(id); }, [flushNow]);`
- Vanish-on-check: `const [vanishingTasks, setVanishingTasks] = useState<Task[]>([])`. Handler replaces direct `toggleTask` binding for checkbox clicks:

```ts
const handleToggleTask = useCallback((taskId: string) => {
  const task = tasks.find((t) => t.localId === taskId);
  if (!task) return;
  if (task.isChecked) { toggleTask(taskId); return; } // pasted checked rows can be unchecked
  enqueue({ kind: "done", localId: task.localId, notionPageId: task.notionPageId, title: task.title, accumulatedMinutes: task.accumulatedMinutes });
  setVanishingTasks((v) => [...v, { ...task, isChecked: true }]);
  removeTask(taskId);
  window.setTimeout(() => setVanishingTasks((v) => v.filter((t) => t.localId !== taskId)), 450);
}, [tasks, enqueue, toggleTask, removeTask]);
```

- `handleRenameTask(taskId, title)`: find task; `renameTask(taskId, title)`; `enqueue({ kind: "rename", localId: taskId, notionPageId: task?.notionPageId ?? null, title: title.trim() })` — enqueue only if `title.trim()` (hook ignores blanks anyway; rename of unknown task still enqueues title-less no-op? guard with task found + non-blank).
- `handleDeleteTask(taskId)`: find task; `enqueue({ kind: "trash", localId: taskId, notionPageId: task?.notionPageId ?? null })`; `removeTask(taskId)`.
- `handleQuickAdd`: unchanged behavior (`addSingleTask` + buffer line append) **plus** `enqueue({ kind: "create", localId: <new id>, title })` — problem: `addSingleTask` mints its own id internally. Change `addSingleTask` (Task 3) is closed; instead App re-derives: quick-add order = last task in list after call. Simpler and pinned: **change `useTaskList.addSingleTask` to accept an optional `localId`**: `addSingleTask(title: string, localId?: string)`. App passes `const id = crypto.randomUUID(); addSingleTask(title, id); enqueue({ kind: "create", localId: id, title: title.trim() })`. (Small Task 3 amendment — implement here if not already done; hook change is 3 lines.)
- Markdown buffer regeneration: `const prevTasksRef = useRef(tasks); useEffect(() => { if (prevTasksRef.current === tasks) return; prevTasksRef.current = tasks; setMarkdown(tasksToMarkdown(tasks)); }, [tasks]);` — mount-safe (initial value matches), andcovers check/delete/rename/quick-add/merge.
- `handleLoad`: `addTaskList(markdown); setShowInput(false);` — unchanged; re-render reconciliation now preserves ids.
- `openNotionDb`: `if (!databaseId) { showToast("SET YOUR NOTION KEY IN ••• FIRST"); return; }` else `openUrl(\`https://www.notion.so/${databaseId.replace(/-/g, "")}\`).catch(() => showToast("COULDN'T OPEN NOTION"));`
- Remove: `SAMPLE_MARKDOWN` const (textarea `placeholder` keeps equivalent text inline), `loggingIds`, `logging`, `handleLog`, `runBatchSync`/`fetchIncompleteTasks` — re-import correct names, pass new Paper/Chassis props (`vanishingTasks={vanishingTasks}`, `onRenameTask={handleRenameTask}`, `onDeleteTask={handleDeleteTask}`, `onOpenNotion={openNotionDb}`).
- `App.test.tsx`: mock `@tauri-apps/plugin-opener` (`{ openUrl: vi.fn().mockResolvedValue(undefined) }`); `notion_log_batch` → `notion_flush_ops`; first test asserts `key-notion` present; "rolls checked rows up…" rewritten as "checking a task plays strikethrough and removes it": check a task → `.task-row.is-logging` present → waitFor row gone; assert invoke got `notion_flush_ops` with a `done` wire op; the LOG-behavior tests deleted/replaced; new test: click `key-notion` → `openUrl` called with `https://www.notion.so/test-db` (dashes stripped); launch ordering test: seed stored checked? — assert `notion_flush_ops` called before `notion_query_incomplete` via `invoke.mock.invocationCallOrder` on mount with creds set; stored-tasks persistence test: seed `timekeeper.tasks.v1` before render → rows render.

- [ ] **Step 1: Rewrite `App.tsx`** per the decisions above.
- [ ] **Step 2: Rewrite the stale `App.test.tsx` cases** per above (beforeEach stubs `notion_flush_ops` → `{ results: [] }`-equivalent `Promise.resolve([])`; `openUrl` assertion; launch-order assertion).
- [ ] **Step 3: Run full suite** — Run: `npm test` — Expected: all PASS.
- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/hooks/useTaskList.ts
git commit -m "feat: local-first autosync wiring, vanish-on-check, persisted markdown, open-notion key"
```

---

### Task 11: README + docs + final verification

**Files:**
- Modify: `README.md` (features list: persistence keys, inline rename/delete, vanish-on-check, 30 s background sync, NOTION ↗ key replaces LOG; acknowledge "delete sends pages to Notion trash")
- Verify: no lingering references

- [ ] **Step 1: Update README** features bullets to match shipped behavior.
- [ ] **Step 2: Grep for dead references** — Run: `grep -rn "notion_log_batch\|runBatchSync\|planBatchSync\|key-log\|SAMPLE_MARKDOWN\|LOGGING" src src-tauri README.md` — Expected: no matches.
- [ ] **Step 3: Full verification** — Run: `npm test && npm run build && cd src-tauri && cargo check` — Expected: green; TypeScript no errors; Rust compiles.
- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: readme for autosync, inline editing, persistent tasks"
```

---

## Self-review notes

- Spec coverage: persistence keys (T3,T4,T10), inline rename/delete (T7,T8), vanish-on-check (T7,T10), batched 30 s flush + launch/refresh ordering (T2,T4,T9,T10), LOG→NOTION ↗ (T9,T10), Notion trash semantics (T5), merge dedupe + pending-op filter (T1-adjacent in T2,T3,T10), markdown buffer regeneration (T1,T10), first-run behavior (T3 empty-seed, T10 placeholder kept inline), README (T11).
- Amended-spec items (op folding incl. create→done→trash collapse, `rename.notionPageId: string | null`, RENDER id stability via `reconcileParsed`, synchronous vanish, flush-before-pull) are all carried into tasks.
- Type consistency: `PendingOp` fields (`id`, `attempts`) are consistent across T2/T4/T10; `WireOp.opIds` matches the Rust `opIds` rename; `OpResult.pageId` camelCase matches Rust `page_id` → `rename_all = "camelCase"` gives `pageId`. ✓
