# Design: Tauri Typewriter Focus Widget (TimeKeeper)

Date: 2026-11-18
Status: Approved — Notion integration direction approved; five locked specifications incorporated
Approval: Granted by human partner (2026-11-18); locked specs incorporated per human direction (2026-11-18)

## Intent and why

Build a desktop widget that combines task tracking and time keeping, wrapped in a retro typewriter metaphor: a sheet of paper rolls out of the top to hold tasks; the typewriter chassis with tactile keys and a small display sits at the bottom.

The metaphor is the product, not decoration. The interaction design follows from it — typing/pasting a Markdown task list, pressing a typewriter key to "log" completions, start/pause/reset keys on the chassis for the timer.

The user wants the OS window itself to be frameless, transparent, and always-on-top, so the widget genuinely floats over the desktop like a physical desk object.

## Goals

1. Frameless, transparent, always-on-top OS window; draggable by grabbing the non-interactive chassis area.
2. Paper section (top half): off-white, slightly warm paper background; Markdown task-list input; parses task lists (`- [ ] …`) into interactive checklist; clicking a task animates strikethrough + check-off.
3. Chassis section (bottom half): tactile retro-looking keys, small digital display; holds a toggleable Timekeeper (Timer / Stopwatch).
4. Timer mode: Pomodoro-style countdown (default 25:00) with Start / Pause / Reset typewriter keys.
5. Stopwatch mode: counts up from 00:00:00.
6. On timer completion or stopwatch session end: prompt user to append the tracked time next to the currently active task on the paper.
7. LOG key: batch-sync completed tasks to the backend of record (Notion).

## Locked specifications (incorporated 2026-11-18)

### Task identity & state model (LOCKED)

Unified local object for every paper item:

```
{ localId: string, notionPageId: string | null, title: string, isChecked: boolean, accumulatedMinutes: number }
```

- For Notion-fetched tasks, `localId === notionPageId`.
- For manually typed tasks, `localId = crypto.randomUUID()` and `notionPageId = null`.
- All UI selection and time accumulation are keyed against `localId`.

### Notion property contract (LOCKED, FINAL)

- Task (`title`): `{ title: [{ text: { content: title } }] }`
- Status (`status`): enum strings `"To Do"`, `"In Progress"`, `"Done"`. Query filters exclude `"Done"`. LOG sets `{ status: { name: "Done" } }`.
- Time (Min) (`number`): `{ number: accumulatedMinutes }`. If an existing Notion task already has a non-zero `Time (Min)` when fetched, initialize `accumulatedMinutes` with that existing number so new sessions add to it.
- Logged At (`date`): writable Date property; LOG sets `{ date: { start: new Date().toISOString() } }`.

### Push timing & state flow (LOCKED)

- Confirming the session-end prompt immediately mutates `accumulatedMinutes` in local React state and renders a pill badge (e.g., `25m`) next to the task on the paper. No Notion API call occurs until LOG is pressed.
- Pressing LOG sends batched API requests for all tasks where `isChecked === true`. A task is removed from local state / the paper only after its Notion API call resolves `200 OK`. On failure, keep the task on the paper and surface an error toast.

### Active task designation & fallbacks (LOCKED)

- Clicking a task's text (not its checkbox) sets `activeTaskId = task.localId` (task highlighted with a red underline). Clicking it again clears `activeTaskId = null`.
- If a session ends while `activeTaskId === null`, the session-end prompt must include a quick `<select>` dropdown of current paper tasks to assign the minutes to, alongside a **Discard** button. Discard drops the session time without mutating state.

### Duration-to-minutes conversion (LOCKED)

- Convert elapsed time via `Math.max(1, Math.round(elapsedSeconds / 60))` for any session >= 15 seconds. Sessions < 15 seconds auto-discard without showing the prompt.

## Decisions (as agreed)

- **Framework:** Tauri (v2) + React + Vite + Tailwind CSS. Tauri chosen over Electron after discussion (user decision; recommended for binary size and native always-on-top handling; Electron retained as fallback).
- **Window flags (Tauri):** transparent background, no decorations, always on top; drag via Tauri `startDragging()` triggered from the non-interactive chassis area.
- **Task parsing:** Markdown task lists (`- [ ]`, `- [x]`); richer Markdown rendering out of scope.

## Open items for the builder (not yet decided here)

- Default window dimensions and minimum size.
- Exact typewriter typography (font family/source) and key-cap geometry.
- Paper "roll" visual treatment and chassis styling details.
- LCD display styling (font, color, segments).
- Notion token storage backend details (Tauri store / secret storage).

## Approval and next steps

- Notion integration direction: approved by human partner (2026-11-18).
- Five locked specifications: incorporated per human direction (2026-11-18).
- Design status: approved for planning.
- Next step: implementation planning (superpowers:writing-plans).
