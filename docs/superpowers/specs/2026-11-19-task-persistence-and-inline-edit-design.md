# Task Persistence & Inline Editing — Design

**Date:** 2026-11-19
**Status:** Approved (design conversation, pre-doc)

## Intent / Why

Every restart re-seeds the widget with the three hardcoded sample tasks
(`SAMPLE_MARKDOWN`), discarding the user's real list. The user wants the
typewriter to have persistent memory of their tasks, and to edit tasks
(delete, rename) directly on the paper instead of via the raw-Markdown path.

## Goals

- Tasks persist across restarts: title, checked state, accumulated minutes,
  and Notion page links all survive.
- Inline editing on the paper: double-click a task title to rename in place;
  ✕ button per row to delete.
- Quick-add, checkbox toggles, renames, deletes, and LOG-driven removals all
  write through to the same stored list.

## Non-goals

- No Notion schema changes; Notion remains optional.
- No cross-device sync, no multiple lists, no undo (delete is immediate).
- Sample tasks never auto-appear again; a fresh profile starts on the empty
  paper state ("Paper is clean.").

## Approaches considered

1. **localStorage persistence (picked).** Same mechanism already used for
   theme and Notion credentials. Survives restarts in the Tauri webview,
   zero new dependencies, trivially testable with vitest.
2. **Tauri store/filesystem plugin.** More durable and inspectable as a
   file, but adds a Rust/plugin dependency and async plumbing for no gain at
   this scale.
3. **Notion as single source of truth.** Would make the widget useless
   offline and couple local-only tasks to a network service. Rejected.

Editing UX options (from conversation): option 1 (inline rename + per-row ✕)
was picked over an edit-mode toggle and per-row hover menus — calmest fit for
the 220×220 paper.

## Design

- **Storage:** versioned localStorage keys
  - `timekeeper.tasks.v1` — JSON `Task[]` (full shape incl. `localId`,
    `notionPageId`, `isChecked`, `accumulatedMinutes`).
  - `timekeeper.markdown.v1` — raw Markdown string backing EDIT .MD.
- **`useTaskList`** initializes state from `timekeeper.tasks.v1` (fallback:
  empty list; malformed JSON → empty + console.warn) and persists via
  `useEffect` on every task-list change. Sample Markdown is no longer the
  seed.
- **App** initializes the `markdown` state from `timekeeper.markdown.v1`
  (fallback: empty string) and persists it on change, so the editor and the
  rendered list stay consistent across restarts.
- **Merge with Notion:** `mergeFetched` dedupes by `notionPageId` — a fetched
  task whose `notionPageId` matches a stored task updates that task's title
  only, preserving local checked state and accumulated minutes. Fetched-only
  tasks are appended. This prevents duplicates after a restart + refresh.
- **Rename:** double-click on the task title swaps the title into an inline
  `<input>`; Enter or blur commits (trimmed; whitespace-only or empty reverts
  to the old title); Escape cancels. New hook action `renameTask(localId,
  title)`; `Paper` renders the input when a row is in editing state.
- **Delete:** small ✕ button per row (next to the time pill) calling the
  existing `removeTask`. Immediate, no confirmation (non-goal: undo).
- **Markdown sync:** quick-add still appends a `- [ ]` line to the raw
  markdown string; renames/deletes update that string too so a later
  DONE (RENDER) doesn't resurrect or drop tasks. `renameTask` and
  `removeTask` callers in App regenerate the markdown lines for local
  (non-Notion) tasks. Simpler rule: after any local structural change, App
  rewrites `timekeeper.markdown.v1` from the current local (non-Notion)
  tasks.

## Open calls (mine, correctable)

- Active-task selection is not persisted (session prompt re-asks; harmless).
- First run after upgrade shows an empty paper rather than the samples;
  existing stored credentials/theme are untouched.
- LOG keeps its current remove-after-sync behavior; removals persist.

## Testing

- `useTaskList.test.ts`: loads from storage, persists on change, malformed
  JSON fallback, `renameTask` (commit/revert), `mergeFetched` dedupe keeps
  local minutes/checked.
- App-level: markdown restored from storage (if existing tests cover App).
