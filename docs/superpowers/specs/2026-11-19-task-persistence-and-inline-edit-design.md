# Task Persistence, Inline Editing & Local-First Notion Autosync — Design

**Date:** 2026-11-19
**Status:** Draft for approval
**Supersedes:** `2026-11-19-task-persistence-and-inline-edit-design.md` (adds the autosync model)

## Why

On every launch the widget re-seeds hardcoded sample tasks and discards the
user's real list. The user wants the typewriter to remember their tasks, to
edit them (rename/delete) inline on the paper — and, now that editing is
direct, Notion should stay in sync automatically instead of via a manual LOG
button. The app must stay *snappy*: no network on the UI path, ever.

## Goals

- Tasks persist across restarts (title, checked state, accumulated minutes,
  Notion page link).
- Inline paper editing: double-click title → rename; ✕ per row → delete.
- Checking a task plays the strikethrough animation, then the task disappears.
- Notion syncs automatically in the background, local-first, batched
  ("update once in X time") to avoid performance impact.
- Offline-tolerant: every edit applies instantly and locally; Notion catches
  up when internet is available.
- LOG button replaced by a button that opens the Notion database.
- Lightweight, snappy, elegant: no spinners blocking the paper, no modal
  flows.

## Non-goals

- No permanent Notion deletion — the API only exposes trash (archive). Delete
  sends the page to Notion trash (recoverable there 30 days).
- No bidirectional real-time sync / conflict UI. Pull happens on launch and on
  manual refresh; push happens in batches.
- No undo for delete (recoverable via Notion trash).
- No cross-device local state; each install keeps its own local snapshot.

## Approaches considered

**Persistence**

1. **localStorage (picked).** Already the pattern for theme/credentials;
   zero deps; sync API; fits a 220×220 widget.
2. Tauri store/filesystem plugin — more durable semantics, but async plumbing
   and a new dependency for no felt benefit at this scale.

**Sync timing**

1. **Batched flush, local-first (picked).** UI writes only to local state +
   a persisted queue of pending ops; a flusher runs every 30 s and once at
   launch, coalesces ops, and pushes them in one invoke. Matches the
   requested "write locally first, update Notion in X time".
2. Immediate per-mutation sync — chatty, janky on slow networks; rejected.
3. Notion as source of truth — breaks offline use; rejected.

**LOG button**

1. **Replace with an "open Notion database" button (picked)** using
   `tauri-plugin-opener` (`openUrl`), already a dependency, to open
   `https://www.notion.so/<databaseId-without-dashes>`.

## Design

### Storage keys (localStorage)

- `timekeeper.tasks.v1` — `Task[]` JSON (full shape).
- `timekeeper.markdown.v1` — raw Markdown backing EDIT .MD.
- `timekeeper.pendingOps.v1` — `PendingOp[]` JSON (see below).

Malformed JSON → empty fallback + `console.warn`; never crash the widget.

### Data model

`Task` unchanged: `{ localId, notionPageId, title, isChecked, accumulatedMinutes }`.
Accumulated minutes from the timer are stored on the task and pushed to
Notion when the task is checked.

```ts
type PendingOp =
  | { kind: "create"; localId: string; title: string }     // quick-add → To Do page
  | { kind: "done";   localId: string; title: string;      // strikethrough → Done
      notionPageId: string | null; accumulatedMinutes: number }
  | { kind: "rename"; localId: string; notionPageId: string; title: string }
  | { kind: "trash";  localId: string; notionPageId: string | null };
```

`coalesceOps(ops)` groups by `localId` and folds, so a burst of edits costs
one request per task:

- create → done ⇒ one `create` marked done (Status Done, minutes, Logged At).
- create → rename ⇒ create with the new title.
- create → trash ⇒ both dropped (page never existed).
- rename → rename ⇒ last wins. done → trash ⇒ kept, in that order.
- trash with no `notionPageId` and no queued create ⇒ dropped.
- rename of a never-created task with no queued create/done ⇒ dropped (its
  create, if any, carries the current title — quick-add creates immediately
  queue a create, so this only affects stale ops).

### Local-first flows

1. **Quick-add.** Task appended locally + persisted; a `create` op is queued.
   Notion gets it at the next flush (Status To Do). *Call: creating on the
   tick, not synchronously — paper stays instant.*
2. **Check.** `isChecked` flips locally; CSS strikethrough animation plays
   (~450 ms); task is removed from the list; `done` op queued with the
   accumulated minutes; markdown buffer is regenerated from remaining tasks.
   Optimistic: the task is gone from the paper before Notion responds.
   *Call: mint-on-check for minutes — Time (Min) written at completion.*
3. **Rename.** Double-click title → inline `<input>`; Enter/blur commits
   (trimmed; empty/whitespace reverts); Escape cancels. `rename` op queued
   (no-op for never-created tasks). Markdown regenerated.
4. **Delete (✕).** Task removed locally + persisted; `trash` op queued.
   Markdown regenerated. *Notion effect: archive (trash), the only delete
   the API offers.*
5. **Timer sessions** are unchanged; minutes still land on the active task and
   flow to Notion at check-time via the `done` op.

### Flush engine (`src/lib/sync.ts` + `usePendingOps`)

- State: `pendingOps` persisted on every change (same write-through pattern
  as tasks).
- Triggers: every **30 s** interval; once at launch; on manual refresh (the
 ↻ button now also flushes after the pull). Skipped silently when no
  credentials are set or `navigator.onLine` is false.
- Invoke `notion_flush_ops({ apiKey, databaseId, ops })` (Rust): one HTTP
  round trip per coalesced op, executed in order: creates, dones, renames,
  trashes. Each op result returns `{ opId, ok, error, pageId? }`.
- Applied results: successful `create`/`create-done` writes the returned
  `pageId` back onto the (still-local, unchecked-only) task via its `localId`.
  Hmm — `done` tasks vanish, so `pageId` only matters for plain creates.
- Failure: failed ops stay queued (with attempt count); the tick retries.
  Toast only on manual-flush failure ("SYNC FAILED — will retry"); tick
  failures are silent (console.warn) to avoid toast spam. Total loss is
  impossible: tasks/ops persist locally until Notion acknowledges.
- Launch with creds: flush queued ops first, then `notion_query_incomplete`
  and merge (existing behavior).

### Notion merge (pull)

`mergeFetched` dedupes by `notionPageId`: a fetched task matching a stored
`notionPageId` updates title only (keeps local checked/minutes — checked rows
vanish at check-time, so this mainly protects minutes). Fetched-only tasks
append. Local tasks with no page id are kept untouched.

### UI changes

- **Paper rows:** new ✕ button per row (appears beside the time pill / on the
  row end). Double-click on the title area toggles inline edit input.
  Editing state is local to Paper (`editingId`); only one row editable at a
  time.
- **Chassis:** `LOG` key removed. In its place a `NOTION ↗` key opens the
  database URL via `openUrl` from `@tauri-apps/plugin-opener`; without
  credentials it toasts "SET YOUR NOTION KEY IN ••• FIRST".
- **Refresh ↻** unchanged in looks; now flushes pending ops then pulls.
- Toasts reuse the existing `stamp-toast` style.
- No new colors/type; CSS additions minimal (`.task-edit-input`,
  `.task-delete`), reusing the existing paper aesthetic.

### Markdown buffer

`markdown` state persists in `timekeeper.markdown.v1`. DONE (RENDER) re-parses
and replaces the list (existing behavior) and **rewrites the persisted list**.
Any structural local change (quick-add/rename/delete/check/vanish) regenerates
the buffer from the current local tasks (`- [ ] title` lines) so a later RENDER
can't resurrect deleted or already-done tasks.

### First run after upgrade

Empty paper + existing stored credentials/theme untouched. `SAMPLE_MARKDOWN`
goes away as a seed (it may remain as the textarea placeholder).

## Testing

- `sync` coalesce tests: every folding rule in the table above; drop rules.
- `useTaskList` tests: init from storage; malformed fallback; persisted on
  change; renameTask commit/revert; mergeFetched dedupe keeps local minutes.
- Vanish-on-check: component test — checkbox click → animation class → row
  removed and `done` op enqueued with minutes.
- App: markdown restored from storage where existing App tests allow.

## Size & calls

Small project (new sync engine + inline-edit UI + persistence + one Rust
command). Calls made that you can correct: create-on-tick (not on every
keystroke); 30 s flush interval; minutes written at check-time; delete =
Notion trash; refresh flushes too; tick failures silent, manual-flush
failures toast.
