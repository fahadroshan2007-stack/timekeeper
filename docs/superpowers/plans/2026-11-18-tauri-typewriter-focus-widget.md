# Tauri Typewriter Focus Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a frameless, transparent, always-on-top Tauri desktop widget styled as a retro typewriter that parses Markdown task lists into an interactive paper, runs Pomodoro-style timer/stopwatch sessions, and batch-syncs completed tasks to Notion.

**Architecture:** Tauri v2 desktop shell (Rust) + React/Vite/Tailwind frontend. Frameless/transparent/always-on-top window flags set in Tauri config; drag-to-move via Tauri `startDragging()` triggered from the chassis area; task state lives in React using the unified task object `{ localId, notionPageId, title, isChecked, accumulatedMinutes }`; Notion API access goes through Tauri commands (Rust layer) to avoid webview CORS issues.

**Tech Stack:** Tauri 2 (Rust), React 18, TypeScript, Vite, Tailwind CSS, `@notionhq/client` invoked via the Tauri command layer, Vitest + Testing Library for logic tests.

**Spec:** `docs/superpowers/specs/2026-11-18-tauri-typewriter-focus-widget-design.md`

## Global Constraints

- Tauri 2.x (v2 floor); React 18+; TypeScript; Vite; Tailwind CSS.
- Window must be transparent (`transparent: true`), frameless (`decorations: false`), always on top (`alwaysOnTop: true`).
- Notion API access only via Tauri commands; no direct webview JS fetch to `api.notion.com`.
- Task object shape (LOCKED): `{ localId: string, notionPageId: string | null, title: string, isChecked: boolean, accumulatedMinutes: number }`.
- Status enum (LOCKED): `"To Do"`, `"In Progress"`, `"Done"`. Query excludes `"Done"`. LOG sets Status to `"Done"`.
- Time (Min) (LOCKED): integer Number; initialize from any pre-existing non-zero value on fetch (additive).
- Logged At (LOCKED): Date; LOG sets `{ date: { start: new Date().toISOString() } }`.
- Duration → minutes (LOCKED): `Math.max(1, Math.round(elapsedSeconds / 60))` when session elapsed >= 15 seconds; sessions < 15 seconds auto-discard without prompt.
- Markdown parsing scope (LOCKED): task-list syntax (`- [ ]`, `- [x]`) only.

## Review Focus

- Cross-platform transparent-window behavior (WKWebView / WebView2 / WebKitGTK).
- Notion failure handling: task retained on paper + error toast on non-200 response.
- Sub-15-second session auto-discard.
- Drag vs. interactive element conflict (keys, checkbox, select).
- `accumulatedMinutes` initialization from pre-existing non-zero Notion `Time (Min)` values.

---

## Tasks

### Task 1: Scaffold Tauri + React + Vite + Tailwind project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `src/`, `index.html`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`
- Test: none

**Interfaces:** none

- [ ] **Step 1: Scaffold the Tauri + React + Vite base project**

Run the Tauri scaffold for a React + TypeScript + Vite project and confirm the resulting structure (`src/`, `src-tauri/`, `package.json`).

- [ ] **Step 2: Add Tailwind CSS**

Install and configure Tailwind for the Vite React project (via PostCSS or the Vite plugin, per current Tailwind v4 guidance).

- [ ] **Step 3: Verify the base project compiles**

Run the type-check/build command and confirm it passes.

- [ ] **Step 4: Commit**

```bash
git add package.json vite.config.ts tsconfig.json src index.html src-tauri
git commit -m "chore: scaffold tauri typewriter widget base"
```

---

### Task 2: Configure frameless, transparent, always-on-top window

**Files:**
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`

**Interfaces:** none

- [ ] **Step 1: Set window flags in Tauri config**

Set `decorations: false`, `transparent: true`, `alwaysOnTop: true`, and an initial window size in `src-tauri/tauri.conf.json`.

- [ ] **Step 2: Verify the app launches with the new window config**

Run the Tauri dev build and confirm the window opens frameless, transparent, and always on top.

- [ ] **Step 3: Commit**

```bash
git add src-tauri
git commit -m "feat: frameless transparent always-on-top window"
```

---

### Task 3: Implement drag-to-move of the widget

**Files:**
- Create: `src/lib/windowDrag.ts`
- Modify: chassis/interactive container component
- Test: `src/lib/windowDrag.test.ts`

**Interfaces:**
- Produces: `attachChassisDrag(handle: HTMLElement): () => void` — returns a detach function; only the chassis (non-interactive) area triggers `startDragging`.

- [ ] **Step 1: Write failing test for drag handler**

Test that pointer events on the handle call the drag start and that events originating from interactive elements are ignored.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement the drag handler**

Implement the handler using the Tauri window drag API with interactive-element filtering.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

---

### Task 4: Build typewriter theme layout (paper + chassis)

**Files:**
- Create: `src/components/Paper.tsx`, `src/components/Chassis.tsx`, `src/App.tsx`
- Modify: global styles / Tailwind tokens

**Interfaces:** none

- [ ] **Step 1: Create Paper component with off-white paper background**

- [ ] **Step 2: Create Chassis component with retro key styling + display**

- [ ] **Step 3: Wire Paper and Chassis into App layout**

- [ ] **Step 4: Verify dev build compiles**

- [ ] **Step 5: Commit**

---

### Task 5: Task list state: parsing, toggling, accumulation, duration conversion

**Files:**
- Create: `src/lib/tasks.ts`, `src/lib/time.ts`
- Test: `src/lib/tasks.test.ts`, `src/lib/time.test.ts`

**Interfaces:**
- Produces:
  - `type Task = { localId: string; notionPageId: string | null; title: string; isChecked: boolean; accumulatedMinutes: number }`
  - `parseTaskList(markdown: string): Task[]`
  - `toggleTask(task: Task): Task`
  - `elapsedSecondsToMinutes(elapsedSeconds: number): number` — returns minutes via `Math.max(1, Math.round(elapsedSeconds / 60))` for elapsed >= 15, else discard semantics.

- [ ] **Step 1: Write failing tests for task parsing and toggling**

Cover `- [ ]` / `- [x]` parsing into Task objects and toggle behavior.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement task parsing/toggle/accumulation logic in `src/lib/tasks.ts`**

- [ ] **Step 4: Write and implement duration conversion test in `src/lib/time.ts`**

- [ ] **Step 5: Run all tests to verify they pass**

- [ ] **Step 6: Commit**

---

### Task 6: Timekeeper: timer/stopwatch engine, controls, session-end prompt, discard

**Files:**
- Create: `src/lib/timekeeper.ts`, `src/components/TimekeeperControls.tsx`, `src/components/SessionEndPrompt.tsx`

**Interfaces:**
- Consumes: Task state from Task 5 (task list, accumulated minutes, active task).
- Produces: Timekeeper engine API (start / pause / resume / stop / elapsed) and session-end prompt behavior (mutate accumulated minutes on confirm, select fallback, discard).

- [ ] **Step 1: Write failing tests for timekeeper engine and duration/discard rules**

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement timekeeper engine, controls, and session-end prompt**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

---

### Task 7: Notion sync: Tauri commands, LOG batch push, clear-after-200, error toast

**Files:**
- Create: `src-tauri/src/commands/` (Notion command module), `src/lib/notion.ts`
- Modify: task LOG handler / task list state integration

**Interfaces:**
- Consumes: Task type and task state produced by Task 5; Notion property contract (LOCKED).
- Produces: Tauri command(s) for Notion fetch/log; frontend wrapper; LOG batch flow.

- [ ] **Step 1: Write failing tests for batch LOG decision logic**

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement Notion Tauri commands and frontend sync wrapper**

- [ ] **Step 4: Implement LOG flow (PATCH/POST per task, clear after 200 OK, error toast)**

- [ ] **Step 5: Run tests / verify build**

- [ ] **Step 6: Commit**

---

## Self-Review (completed during plan authoring)

1. **Spec coverage:** Each spec section maps to tasks — window flags → Task 2; layout → Task 4; parsing/toggle/accumulation → Task 5; timekeeper/prompt → Task 6; LOG/Notion → Task 7; drag → Task 3. No spec requirement is uncovered.
2. **Step scan:** Each step was written as one checkable action; no step bundles multiple decisions.
3. **Type consistency:** The `Task` type is defined in Task 5 and consumed unchanged by Tasks 6 and 7; Notion property shapes are pinned in the design doc and restated in Global Constraints.
4. **Review Focus:** Each listed risk has a owning task and (where unit-testable) a test — transparency (Task 2 verification), Notion failure (Task 7 tests), sub-15s discard (Task 5/6), drag conflict (Task 3), accumulated-minutes init (Task 5/7).
5. **Proportion:** Tasks map 1:1 to spec sections without transcribing implementation bodies.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-18-tauri-typewriter-focus-widget.md`. Please review the plan. Does it capture what you want?

- **Subagent-driven** — a fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest.

**For this plan I recommend subagent-driven, because the tasks have hard interfaces between them (Task type, duration helpers, LOG flow) that benefit from independent per-task verification.**

Which approach should we use?
