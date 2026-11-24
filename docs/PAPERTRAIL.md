# TimeKeeper — The Journey of Building a Productivity Tool

**Living document:** `docs/PAPERTRAIL.md`
**Intended final form:** a polished PDF titled *"TimeKeeper — The Journey of Building a Productivity Tool"*.
**Status:** Living source of truth (Markdown). PDF generation is **not** yet performed — the Markdown structure here is the source for the future PDF.
**Compiled against:** commit `2d666be79086f553fb3f0c177a052b17caca271e` (2026-11-24), branch `main`.
**Project period covered:** 2026-11-18 → 2026-11-24 (single development sprint, ~6 days of commits).

---

## Purpose of this document

This is not a conventional changelog. It is the chronological, narrative record of *how* the TimeKeeper project evolved — why decisions were made, what broke, how it was fixed, and what the architecture looked like at each point in time. The history is reconstructed from Git history, repository documentation, design specs, implementation plans, source code, and release artifacts.

Where a later section becomes the foundation for the PDF, it should read like a well-documented engineering journey, not a terminal dump.

---

## How to read this document

Every claim is tagged with its evidentiary status:

- **[VERIFIED]** — directly observable in the repository at a specific commit, in Git metadata, in committed documentation, or in source code at that commit.
- **[INFERRED]** — a reasonable interpretation of verified evidence; the underlying fact may be true but the interpretation is the author's/j developer's reasoning.
- **[UNKNOWN]** — not determinable from the available evidence.

The project owner (human partner) should treat **[UNKNOWN]** items as open questions for future papertrail updates.

---

## Source inventory and methods (Phase 1 findings)

### Repositories and VCS state

- **Repo:** `/mnt/d/Fahad/Apps/Code Projects/TimeKeeper` (git, branch `main`, remote `origin/main`).
- **History:** 55 commits, linear, on a single branch; no other branches or stashes present.
- **Span:** 2026-11-18 → 2026-11-24 (all commits authored in that window, UTC).
- **Tags:** annotated tags `v0.1.0` → commit `c7f89eeec65694b221e76aebc98e64bdfc94a2d7`; `v0.1.1` → commit `99f0b814c3981083fde0d710ed15805c5717087c`.

### Primary sources inspected

| Source | Path | Notes |
|---|---|---|
| Design spec | `docs/superpowers/specs/2026-11-18-tauri-typewriter-focus-widget-design.md` | Approved design; locked specs |
| Implementation plan | `docs/superpowers/plans/2026-11-18-tauri-typewriter-focus-widget.md` | Task breakdown |
| Design (persistence/autosync) | `docs/superpowers/specs/2026-11-19-task-persistence-and-inline-edit-design.md` | Superseded by the autolog design |
| Plan (persistence/autosync) | `docs/superpowers/plans/2026-11-19-task-persistence-autosync.md` | Implementation plan + SDD ledger |
| Design (autolog redo) | `docs/superpowers/specs/2026-11-22-autolog-undone-tasks-design.md` | Event-driven autolog directive |
| Plan (autolog redo) | `docs/superpowers/plans/2026-11-22-autolog-undone-tasks.md` | Redo plan |
| SDD ledgers | `.superpowers/sdd/2026-11-19-task-persistence-autosync/progress.md`, `.superpowers/sdd/2026-11-22-autolog-undone-tasks/progress.md`, task briefs, review diffs | Development-status ledgers |
| Product docs | `README.md` | Feature + release notes |
| Mockups | `docs/mockups/*`, `typewriter_timekeeper_visual_reference.html` | Design exploration |
| Application source | `src/**` (App, components, hooks, lib, CSS) | Implementation |
| Backend source | `src-tauri/**` (Rust commands, Tauri config, capabilities) | Implementation |
| CI | `.github/workflows/rust-backend.yml` | Rust check + test workflow |
| Releases | `archive/Versions/**`, Git tags/releases | v0.1.0 / v0.1.1 binaries |

### Method notes

- Git history was read in full (`git log --all`, per-path logs, diffs between tagged releases and key commits).
- Working-tree state was compared against `HEAD` via `git status` / `git diff HEAD` to identify uncommitted work.
- Committed documentation (design specs, plans, README, SDD ledgers) was treated as the primary narrative source; source code and commit diffs were used to corroborate.

---

## 1. Project Origins

### 1.1 The original idea and motivation

- **[VERIFIED]** The founding design document (`docs/superpowers/specs/2026-11-18-tauri-typewriter-focus-widget-design.md`, dated 2026-11-18) states the intent: build a desktop widget that combines task tracking and time keeping, wrapped in a retro typewriter metaphor — "a sheet of paper rolls out of the top to hold your tasks; the chassis below carries the controls — including a countdown timer (Pomodoro) and a stopwatch — with a small LCD display and mechanical keys."
- **[VERIFIED]** The motivation: existing productivity tools were generic lists and timers; the user wanted a physical, desk-object-like artifact. The design is explicit that "the metaphor is the product, not decoration."
- **[VERIFIED]** The interaction philosophy: "The interaction design follows from it — typing/pasting a Markdown task list, pressing a typewriter key to 'log' completions, start/pause/reset keys on the chassis for the timer."
- **[INFERRED]** The deeper motivation implied by the design: focus should be a physical, tactile ritual rather than a software list. The typewriter framing converts task check-ins and time tracking into typed keystrokes.

### 1.2 Problem TimeKeeper was intended to solve

- **[VERIFIED]** The design frames the product as solving the friction where task tracking and time tracking live in separate tools or fail to connect. Completed work is pushed to a backend of record (Notion) with accumulated minutes; the widget itself is the interface.
- **[UNKNOWN]** The precise personal workflow the user wanted to solve is not recorded beyond the design docs; the design speaks in product terms rather than personal-use detail.

### 1.3 Initial vision and design philosophy

- **[VERIFIED]** Philosophy: the OS window itself should be frameless, transparent, and always-on-top, so the widget genuinely floats over the desktop like a physical desk object (user decision; Tauri recommended over Electron for binary size and native always-on-top behavior).
- **[VERIFIED]** Product pillars from the design: metaphor-as-product, immediate tactile interaction, local-first task state where relevant, Notion as backend of record.

### 1.4 Original feature requirements

- **[VERIFIED] Locked specifications (incorporated 2026-11-18, human-approved):**
  - Task identity/state model: `{ localId, notionPageId, title, isChecked, accumulatedMinutes }`; Notion-fetched tasks use `localId === notionPageId`.
  - Notion property contract: Task title, Status enum (`To Do` / `In Progress` / `Done`), `Time (Min)` number, `Logged At` date.
  - Push timing: confirm session-end → mutate local minutes → no Notion call until LOG.
  - Active task designation + fallback (click task text to set/clear; session-end prompt includes task select + Discard).
  - Duration → minutes: `Math.max(1, Math.round(elapsedSeconds / 60))` for sessions ≥ 15 s; sub-15 s auto-discard.
  - Markdown parsing scope: task-list syntax (`- [ ]`, `- [x]`) only.

---

## 2. Evolution of the Product

### 2.1 Concept → first public release (2026-11-18)

- **[VERIFIED]** Day one of development (2026-11-18) delivered the core in a rapid sequence of small commits: scaffold → window flags → drag → paper/chassis layout → task parsing → timekeeper engine → Notion batch sync → app orchestration.
- **[VERIFIED]** The first public release, **v0.1.0** (tagged at commit `c7f89ee`, 2026-11-18 23:46:18), contained the batch-sync era feature set: batch LOG sync to Notion, paper editing via Markdown, timer/stopwatch, themes, mockups.
- **[VERIFIED]** The only functional delta in **v0.1.1** (tagged at commit `99f0b81`, 2026-11-19 00:05:47, "fix: lock window to 220x220 non-resizable (bulges broke compact layout); bump 0.1.1") was the window-lock fix; release linking commits followed (`e15b83f`, `5b0da44`).

### 2.2 The persistence + local-first autosync era (2026-11-19 → 2026-11-22)

- **[VERIFIED]** After the first release, the design phase shifted to keeping tasks across restarts and making Notion sync automatic ("local-first autosync").
- **[VERIFIED]** Implementation (commits `a243f11` → `8fc85ab`, `174669b`, `b479482`, etc., 2026-11-19 → 2026-11-22) introduced: localStorage persistence (`timekeeper.tasks.v1`, `timekeeper.markdown.v1`, `timekeeper.pendingOps.v1`), inline task rename/delete on the paper, vanish-on-check animation, a pending-ops queue with coalescing (`coalesceOps`), flush engine, `notion_flush_ops` Rust command replacing `notion_log_batch`, launch/refresh flush-before-pull, and a 30 s autosync interval.
- **[VERIFIED]** The design then evolved into **event-driven autolog** (2026-11-22): Notion requests are sent only when the typewriter updates; the 30 s interval was removed in favor of update-triggered, debounced (~1 s) flushes, plus flush on app close, manual refresh, launch catch-up, and reconnect.
- **[VERIFIED]** The LOG key was replaced by a `NOTION ↗` key that opens the Notion database via `tauri-plugin-opener`.

### 2.3 The November 24 reversal and the pagination milestone

- **[VERIFIED]** On 2026-11-24 at 12:20:03 UTC, commit `f12ff7b` — *"feat(notion): follow database query pagination via next_cursor"* — is a large change touching 20 files (668 insertions, 1,595 deletions), including a broad reversion of the local-first autosync implementation work (App orchestration, paper, chassis, task library, task hook, Notion client, styles, tests) back toward the batch-sync era, while adding cursor-based pagination to the Notion query path.
- **[VERIFIED]** Immediately adjacent commits: `dff0ca6` (12:41:05) *"fix: restore version 0.1.1 regressed to 0.1.0 in f12ff7b"* — a version-metadata-only correction; `4e02278` (12:57:39) added the Rust backend CI workflow; `2d666be` (13:34:45) *"fix: flatten notion query results pages in pagination merge"* hardened pagination merging (dedupe, request-id handling, closed pagination).

### 2.4 Product feature evolution (notable shipped behaviors, pre-revert)

- **Window:** frameless / transparent / always-on-top; drag via chassis; later locked to 220×220 non-resizable.
- **Paper:** Markdown task list paste → interactive checklist; checkbox check → strikethrough + vanish; double-click title → inline rename; ✕ → delete; quick-add; EDIT .MD / DONE (RENDER) / ↻; time pills.
- **Chassis:** LCD display (timer countdown / stopwatch count-up), TMR/SW rocker, presets 15m/25m/45m, keycaps (START/STOP-RESET, LOG, settings •••), theme toggle, minimize/close, active-focus label, session-end ribbon.
- **Notion:** batch LOG sync; credentials via settings; toast feedback; failures keep tasks.

---

## 3. Technical Evolution

### 3.1 Technology stack and rationale

- **[VERIFIED]** Stack at all phases: Tauri 2 (Rust backend) + React 19 + TypeScript + Vite + Tailwind CSS v4; `@tauri-apps/api` v2; `@tauri-apps/plugin-opener` v2; backend Notion calls via `reqwest`; HTTP client with `notion-version: 2022-06-28` header.
- **[VERIFIED]** Testing: Vitest + @testing-library/react + jsdom (frontend); Rust unit tests in `src-tauri/src/commands/notion.rs`; Playwright used only for mockup screenshots.
- **[INFERRED]** The plan (2026-11-18) targeted React 18; the shipped implementation used React 19 — a version drift worth recording in the papertrail.

### 3.2 Architecture evolution

- **v0.1.x (batch era):** React state (`App` + `useTaskList`) → `planBatchSync` / `runBatchSync` / `notion_log_batch` → Notion API. Checked tasks PATCHed (or POSTed if page-less) with `Status: Done`, `Time (Min)`, `Logged At`.
- **Nov 2026 (local-first era):** task state persisted to localStorage; pending-ops queue persisted; coalescing; flush engine; `filterFetched` merge guard; markdown buffer regeneration.
- **Nov 2026 (event-driven era):** `createProgress` / `progress` ops for undone-task logging; sweep on check/time-update; debounced flush; app-close final flush.
- **2026-11-24 (current):** backend retains `notion_log_batch` + paginated `notion_query_incomplete`; the frontend has reverted to the batch-sync client surface.

### 3.3 Notion integration

- **[VERIFIED]** Notion API integration lives in Rust Tauri commands to avoid webview CORS issues.
- **[VERIFIED]** Auth: bearer token (`NOTION_API_KEY`), `notion-version: 2022-06-28` header (fixed after an earlier missing-version issue, commit `db573d2`).
- **[VERIFIED]** Query: filter `Status does_not_equal Done`, page size 100, cursor pagination via `next_cursor`, merge pages, dedupe by page id, cap at `MAX_NOTION_QUERY_PAGES = 100`, errors surface per page.
- **[VERIFIED]** Write: `notion_log_batch` — checked tasks → PATCH `/v1/pages/{id}` (or POST create when no page id) with Task/Status/Time (Min)/Logged At.
- **[VERIFIED]** Delete semantics (design): Notion delete = trash (`archived: true`) — the only delete the API offers.

### 3.4 Timer and task-management implementation

- **[VERIFIED]** `Timekeeper` engine (`src/lib/timekeeper.ts`): countdown vs stopwatch, pause/resume with consumed-seconds accounting, start idempotence guard, stop returns elapsed seconds.
- **[VERIFIED]** Duration conversion (`src/lib/time.ts`): < 15 s → discard (0 minutes); ≥ 15 s → `Math.max(1, Math.round(elapsedSeconds / 60))`.
- **[VERIFIED]** Session-end prompt (`src/components/SessionEndPrompt.tsx`): assign minutes to active task or pick from task list; Discard supported.

### 3.5 Testing infrastructure

- **[VERIFIED]** Frontend unit/integration tests: task parsing/toggle (`src/lib/tasks.test.ts`), duration (`src/lib/time.test.ts`), timekeeper (`src/lib/timekeeper.test.ts`), drag (`src/lib/windowDrag.test.ts`), Notion (`src/lib/notion.test.ts`, `src/lib/notion-fetch.test.ts`), hook (`src/hooks/useTaskList.test.ts`, `src/hooks/useTimekeeperSession.test.ts`), App integration (`src/App.test.tsx`).
- **[VERIFIED]** Paper component tests (`src/components/Paper.test.tsx`) were written during the autosync era (task briefs `task-7/8/9/10/11-brief.md`) and are currently **absent from the working tree** (deleted without commit; still tracked in `HEAD`).
- **[VERIFIED]** Evidence of test runs recorded in SDD ledgers: `npm test` → 90 passed (12 files) at plan Task 11; final suite 96/96 after fixes; event-driven autolog final verification → 115/115 passed, build green; Rust verification by inspection only (cargo unavailable in environment) until the CI workflow was added.
- **[VERIFIED]** Rust tests added with pagination: query body filters, next-cursor body, `should_fetch_next`, `merge_query_pages` (dedupe/closed pagination/first request id/empty results).

---

## 4. Development Timeline

### 4.1 Chronological milestone table

| Date (UTC) | Commit | Milestone | What happened | Why it mattered | Files | Outcome |
|---|---|---|---|---|---|---|
| 2026-11-18 20:21:58 | `3b964d2` | Design inception | Initial design docs created | Locked direction before code | `docs/superpowers/*` | Approved design |
| 2026-11-18 20:29 | `23c01d2` | Scaffold | Tauri + React + Vite + TS + Tailwind base scaffolded | Foundation | `package.json`, `src-tauri/*`, `src/*` | Base green |
| 2026-11-18 20:30 | `0de0e9d` | Window | Frameless/transparent/always-on-top window | Core UX requirement | `src-tauri/tauri.conf.json` | Floating widget |
| 2026-11-18 20:33 | `ef498af` | Drag | Chassis drag handler | Physical feel | `src/lib/windowDrag.*` | Draggable |
| 2026-11-18 20:34 | `c704bdb` | Layout | Paper + chassis layout | Structure | `src/App.tsx`, `src/components/*` | Widget shape |
| 2026-11-18 20:35 | `fdd7e08` | Tasks | Task parsing + duration conversion | Core model | `src/lib/tasks.*`, `src/lib/time.*` | Checklist |
| 2026-11-18 20:39 | `5b2ff65` | Timekeeper | Engine + session-end prompt | Timing | `src/lib/timekeeper.*`, `src/components/SessionEndPrompt.tsx` | Timer/stopwatch |
| 2026-11-18 20:42 | `af2f189` | Notion | Batch sync (`notion_log_batch`, `notion_query_incomplete`) | Backend of record | `src-tauri/src/commands/notion.rs`, `src/lib/notion.*` | Sync v1 |
| 2026-11-18 20:42–20:54 | `2b8af73` | Orchestration | App wiring, settings, toasts, README, first mockup | Integration | `src/App.tsx`, `src/components/SettingsModal.tsx`, `README.md` | Working app |
| 2026-11-18 21:33 | `f23a13d` | Fix | Tailwind styles loaded at app entry + explicit sources | Styles not applied | `src/index.css`, `src/main.tsx` | UI visible |
| 2026-11-18 21:56 | `e1bd49b` | Redesign | Olivetti typewriter redesign (platen roller, LCD, keycaps, quick-add, settings) | Aesthetic milestone | `src/App.tsx`, `src/components/*`, `src/typewriter.css`, mockups | Signature look |
| 2026-11-18 22:09 | `3287709` | Sizing | Compact 220×220 widget sizing | Fit small screens | `src-tauri/tauri.conf.json`, `src/typewriter.css`, mockups | Compact |
| 2026-11-18 22:11–22:31 | `ad48090`, `ddb689a`, `db60444` | Mockups | Design variants / palette studio; AI image gen unavailable → hand-rendered | Design exploration | `docs/mockups/*` | Visual direction |
| 2026-11-18 22:30 | `db573d2` | Fix | Notion-version header, vertical TMR/SW rocker, cap+center wide viewports | Backend + layout | `src-tauri/src/commands/notion.rs`, `src/index.css`, `src/typewriter.css`, mockups | Fixes |
| 2026-11-18 23:08 | `0068f26` | Theme | Noir & Brass late-night theme, grid-aligned ruled lines, toggle | Theme 2 | `src/App.tsx`, `src/components/Chassis.tsx`, `src/typewriter.css`, mockups | Two themes |
| 2026-11-18 23:21 | `44dc442` | UX | LOG roll-up, interactive checkboxes, light micro-animations | Polish | `src/App.tsx`, `src/components/Paper.tsx`, `src/typewriter.css` | Feedback |
| 2026-11-18 23:34 | `80227fa` | Fix | Interactive checklist default on launch; quick-add syncs markdown; clearer zero-results toast | UX fix | `src/App.tsx`, mockups, `src/App.test.tsx` | Launch behavior |
| 2026-11-18 23:46 | `c7f89ee` | **Release v0.1.0** | MIT license added | Legal | `LICENSE`, `README.md` | First public release |
| 2026-11-18 23:57 | `e15b83f` | Release docs | README links v0.1.0 | Release hygiene | `README.md` | Release known |
| 2026-11-19 00:05 | `99f0b81` | **Release v0.1.1** | Window locked 220×220 non-resizable; version bump | Bug fix ("bulges") | `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` | Second release |
| 2026-11-19 00:09 | `5b0da44` | Release docs | README links v0.1.1 | Release hygiene | `README.md` | Release known |
| 2026-11-19 11:47–16:37 | `d05e0ba`, `357b1d6`, `7880bbd`, `bd4c04b` | Design | Persistence + autosync designs, op-folding rulings | Planning | `docs/superpowers/specs/...` | Design locked |
| 2026-11-19 14:11 | `f4d0bb8` | Chore | Cargo.lock synced with 0.1.1 bump | Hygiene | `src-tauri/Cargo.lock` | Clean |
| 2026-11-19 16:37 | `a243f11` | Plan | Implementation plan for persistence + autosync | Planning | `docs/superpowers/plans/...` | Planned |
| 2026-11-20 12:28 | `807cee4` | Impl | `renameTask`, `reconcileParsed`, `tasksToMarkdown` | Inline edit support | `src/lib/tasks.*` | Task lib v2 |
| 2026-11-20 12:30 | `01aa164` | Impl | Pending-op sync engine (coalesce, flush results, fetch filter) | Sync core | `src/lib/sync.*` | Engine v1 |
| 2026-11-20 12:32 | `644a4d6` | Impl | Task list persistence to localStorage, inline rename, fetch dedupe | Persistence | `src/hooks/useTaskList.*` | Persistence v1 |
| 2026-11-22 09:19 | `9bdbd7b` | Impl | Pending-ops queue hook + batched flush | Sync core | `src/hooks/usePendingOps.*` | Hook v1 |
| 2026-11-22 09:22 | `101971f` | Impl | `notion_flush_ops` replaces `notion_log_batch` | Backend | `src-tauri/src/commands/notion.rs`, `src-tauri/src/lib.rs` | Backend v2 |
| 2026-11-22 09:20 | `3ef6d62` | Impl | `flushOps` invoke replaces batch planner | Client | `src/lib/notion.ts` | Client v2 |
| 2026-11-22 09:21 | `3d94d2d` | Impl | Inline rename/delete on paper | UI | `src/components/Paper.*` | UI v2 |
| 2026-11-22 09:24 | `bb88f91` | Style | Delete/inline-edit keys for task rows | UI | `src/typewriter.css`, `src/hooks/*`, `src/lib/*` | UI v2 |
| 2026-11-22 09:25 | `476ab9e` | UX | LOG key → `NOTION ↗` key | UX | `src/components/Chassis.tsx` | UX v2 |
| 2026-11-22 09:27 | `48961de` | Impl | Local-first autosync wiring, vanish-on-check, persisted markdown, open-notion | Integration | `src/App.tsx`, `src/App.test.tsx` | App v2 |
| 2026-11-22 09:30 | `8fc85ab` | Docs | README for autosync, inline editing, persistent tasks | Docs | `README.md` | Docs v2 |
| 2026-11-22 09:32 | `174669b` | Fix | Type-safe op construction + done wire shape | Fix | `src/lib/sync.ts`, `src/hooks/usePendingOps.ts` | Fix v2 |
| 2026-11-22 10:32 | `b479482` | Fix | Stable autosync interval, concurrent-flush guard, task page-id backfill | Fix | `src/App.tsx`, `src/hooks/*`, `src/lib/*` | Fix v2 |
| 2026-11-22 11:43 | `3656988` | Impl | `createProgress` + `progress` wire ops (Rust) | Autolog | `src-tauri/src/commands/notion.rs` | Backend v3 |
| 2026-11-22 12:15 | `58fcefd` | Impl | Progress pending ops + coalescing | Sync | `src/lib/sync.*` | Sync v3 |
| 2026-11-22 12:45 | `bf24a26` | Impl | `enqueueProgress` dedupe | Sync | `src/hooks/usePendingOps.*` | Sync v3 |
| 2026-11-22 12:59 | `5b71187` | Fix | Reachable status/minutes combo in dedupe test | Fix | `src/hooks/usePendingOps.test.ts` | Fix v3 |
| 2026-11-22 18:31 | `9683cf8` | Impl | Event-driven autolog wiring in App | Autolog | `src/App.tsx`, `src/App.test.tsx` | App v3 |
| 2026-11-22 18:58 | `0c818ef` | Fix | Clear pending debounced flush on app-close final flush | Fix | `src/App.tsx`, `src/App.test.tsx` | Fix v3 |
| 2026-11-23 06:35 | `6a63dc7` | Docs | README event-driven autolog bullets + final verification | Docs | `README.md` | Docs v3 |
| 2026-11-23 12:55 | `1e01993` | Fix | `core:window:allow-destroy` capability for app-close final flush | Fix | `src-tauri/capabilities/default.json` | Fix v3 |
| 2026-11-24 12:20 | `f12ff7b` | **Pivot/revert** | Notion pagination via `next_cursor`; broad revert of autosync-era code | Feature | `src-tauri/src/commands/notion.rs`, `src/App.tsx`, `src/components/*`, `src/hooks/*`, `src/lib/*`, `src/typewriter.css`, `README.md`, version files | State changed |
| 2026-11-24 12:41 | `dff0ca6` | Fix | Restore version `0.1.1` regressed to `0.1.0` in `f12ff7b` | Metadata fix | `package.json`, `src-tauri/Cargo.{toml,lock}`, `src-tauri/tauri.conf.json` | Version restored |
| 2026-11-24 12:57 | `4e02278` | CI | Rust backend check + test workflow | Tooling | `.github/workflows/rust-backend.yml` | CI added |
| 2026-11-24 13:34 | `2d666be` | Fix | Flatten Notion query result pages in pagination merge | Fix | `src-tauri/src/commands/notion.rs` | Pagination hardened |

### 4.2 Narrative arc of the development timeline

1. **2026-11-18 — The sprint that founded the product.** Design docs first, then a single long night of small commits built the entire v0.1.0 feature set, ending with the MIT license and the first release.
2. **2026-11-19 — Release housekeeping.** The window-lock fix and version bump produced v0.1.1 within ~13 minutes of the v0.1.0 release — a fast follow-up indicating early, close user feedback (the "bulge" bug).
3. **2026-11-19 → 2026-11-22 — The autonomy project.** A design → plan → implementation → review cycle added task persistence, inline editing, and local-first autosync, then evolved into event-driven autolog.
4. **2026-11-24 — Pagination + reversal.** The Notion query was found to be paginated; implementing that surfaced (or motivated) a broad reversion of the just-built autosync stack, a version regression, and subsequent fixes.

---

## 5. Challenges and Debugging

### 5.1 Significant technical problems encountered

| # | Problem | Symptom / error | Root cause (established) | Investigation | Solution | Lesson |
|---|---|---|---|---|---|---|
| 1 | Tailwind styles not applied | UI rendered unstyled | Styles not loaded at app entry / missing explicit sources | Commit `f23a13d` *"fix: load tailwind styles at app entry and add explicit sources"* | Loaded at entry, explicit sources | Build-pipeline awareness |
| 2 | Notion API version | Backend calls rejected/ambiguous | Missing `notion-version` header | Commit `db573d2` *"fix: notion-version header..."* | Set `2022-06-28` via reqwest defaults | API versioning |
| 3 | Window "bulges" | Compact 220×220 layout broken | Window could grow beyond design size | Commit `99f0b81` *"fix: lock window to 220x220 non-resizable (bulges broke compact layout)"*; released as v0.1.1 | Hard min/max constraints | Small-window UX |
| 4 | AI image generation unavailable | Mockups could not be AI-generated | No OpenRouter credits | Commits `ad48090`, `ddb689a`, `db60444` → hand-rendered mockups | Hand rendering | Contingency |
| 5 | App-close final flush did not run | Final pending flush skipped on close | Missing OS capability (`core:window:allow-destroy`) | Commits `9683cf8`, `0c818ef`, `1e01993` | Capability added; final flush cleared | Capability wiring |
| 6 | Autosync stability | Interval defeated by flush identity churn; concurrent flushes double-invoke creates; missing page-id backfill | Callback identity churn; no in-flight guard; no backfill | Commits `b479482`, `174669b`, `bf24a26`, `5b71187` | Stable callbacks via refs/primitives; in-flight guard; backfill | Effectful review findings |
| 7 | Op semantics | Folding rules needed (create→done→trash, rename/title, done minutes) | Spec ambiguity; needed reconciliations | Commits `7880bbd`, `bd4c04b`, plan tasks | Amended design decisions | Spec discipline |
| 8 | Notion pagination merge | Multiple pages needed flattening, dedupe, request-id preservation, closed-loop pagination | Single-page response assumed; duplicates possible | Commit `f12ff7b` (added) + `2d666be` *"fix: flatten notion query results pages in pagination merge"* | Dedupe by page id, first request id, close pagination | Data-shape care |

### 5.2 Notable debugging narrative

- **Autolog debugging arc (2026-11-22):** TDD-driven fixes across the pending-ops engine — coalesce semantics, flush-result application, fetch filtering, interval stability, concurrent flush guard, page-id backfill, dedupe, and debounced-flush lifecycle.
- **Pagination debugging arc (2026-11-24):** the Notion query endpoint returns paginated results; the initial client path assumed a single page. The fix introduced cursor following (`next_cursor`), page-size cap, per-page error surfacing, and merge flattening with dedupe and metadata closure.

### 5.3 Known unresolved / unverifiable debugging items

- **[UNKNOWN]** Whether the November 24 reversion of the autosync stack was a deliberate product decision or an incomplete revert; the commit message describes only pagination.
- **[UNKNOWN]** Runtime behavior of the Tauri app on Windows (the developer platform per `archive/` paths) has no recorded automated verification beyond build; manual mockups used Playwright with a Windows chromium executable path.

---

## 6. Important Technical Decisions

### 6.1 Decisions with documented alternatives

| Decision | Choice | Alternatives considered | Evidence |
|---|---|---|---|
| Desktop shell | Tauri v2 + Rust | Electron (fallback) | Design doc: Tauri chosen over Electron (user decision; Tauri recommended for binary size and native always-on-top; Electron retained as fallback) |
| Notion access | Tauri command layer (Rust) | Direct webview fetch | Plan global constraint: avoid CORS issues in webview |
| Task state | Unified local task object with `localId`/`notionPageId` | Separate local + server models | Locked spec, 2026-11-18 |
| Persistence | localStorage | Tauri store/filesystem plugin | Design: localStorage (picked; zero deps, sync API, fits 220×220 widget) |
| Sync timing | Local-first queue + batched/event-driven flush | Immediate per-mutation sync; Notion-as-source-of-truth | Design + autolog directive |
| Delete semantics | Notion trash (`archived: true`) | Hard delete | Design non-goals |
| Create semantics | Omit Status (DB default "Not Started") | Explicit status | Design ruling `bd4c04b` |
| Duration | ≥15 s → `Math.max(1, round(min)); <15 s → discard | Other thresholds | Locked spec |
| Sync trigger | Event-driven (update/close/reconnect/refresh/launch) | 30 s interval (later removed) | Autolog design directive |
| Notion query | Page size 100 + cursor pagination + merge/dedupe/cap | Single-page fetch | `f12ff7b`, `2d666be` |

### 6.2 Implementation decisions worth recording

- **[VERIFIED]** Flush-before-pull ordering at launch/refresh so queued ops are not clobbered by fetches (`filterFetched`, design decision).
- **[VERIFIED]** Fail-closed merge filtering: pages backing queued done/trash ops are excluded from merge, so failed flushes cannot resurrect tasks.
- **[VERIFIED]** Vanish-on-check: task removed synchronously; only animation is ephemeral (~450 ms).
- **[VERIFIED]** Markdown buffer regenerated from task list on structural changes so DONE (RENDER) cannot resurrect deleted/done tasks.

---

## 7. Releases and Version History

### 7.1 Release index

| Release | Tag → commit | Date (UTC) | Content | Notable commits |
|---|---|---|---|---|
| v0.1.0 | `c7f89ee` (annotated tag object `5abdac1`) | 2026-11-18 23:46:18 | First public release: typewriter widget, batch Notion sync, themes, mockups; MIT license. | `c7f89ee`, `e15b83f` |
| v0.1.1 | `99f0b81` (annotated tag object `f0fdbf9`) | 2026-11-19 00:05:47 | Window locked to 220×220, non-resizable; version bump; release links. | `99f0b81`, `5b0da44` |

### 7.2 Version metadata vs. functional changes — the key distinction

- **[VERIFIED]** The **v0.1.0 → v0.1.1** diff (commits `c7f89ee..99f0b81`, touching README, package metadata, Rust/Cargo metadata, Tauri config) contains: version bump `0.1.0 → 0.1.1`, window min/max constraints (`220`×`220`, `resizable: false`), and release links.
- **[VERIFIED]** The functional change in v0.1.1 was the window-lock fix ("bulges broke compact layout").
- **[VERIFIED]** On 2026-11-24, commit `f12ff7b` **regressed the version metadata to `0.1.0`** across `package.json`, `src-tauri/Cargo.{toml,lock}`, and `src-tauri/tauri.conf.json`; commit `dff0ca6` then **restored version `0.1.1`** — a metadata-only correction, not a feature change.
- **[VERIFIED]** The same `f12ff7b` commit also removed the v0.1.1 window-lock constraints from `src-tauri/tauri.conf.json` and removed the `core:window:allow-destroy` capability; the version number was restored but these functional/config reverts were **not** re-applied — an important current-state discrepancy to monitor.

### 7.3 Release artifacts

- `[VERIFIED]` Local release binaries: `archive/Versions/V0.1.0/TimeKeeper_0.1.0_x64_en-US.msi`, `archive/Versions/V0.1.0/timekeeper.exe`; `archive/Versions/V0.1.1/TimeKeeper/timekeeper.exe`, `archive/Versions/V0.1.1/TimeKeeper/uninstall.exe`.
- `[VERIFIED]` README release links referenced GitHub release assets (`TimeKeeper_0.1.1_x64_en-US.msi`, `TimeKeeper_0.1.1_x64-setup.exe`, portable `timekeeper.exe`) at the time of writing; the current README no longer carries the Download section (removed in `f12ff7b`).

---

## 8. Testing and Quality

### 8.1 Test infrastructure

- **[VERIFIED]** Frontend: Vitest config in `vite.config.ts` (`test.environment: "jsdom"`), React Testing Library, jsdom.
- **[VERIFIED]** Backend: Rust unit tests in `src-tauri/src/commands/notion.rs` (query bodies, cursor logic, merge).
- **[VERIFIED]** Tooling: added 2026-11-24 — `.github/workflows/rust-backend.yml` running `cargo check` and `cargo test` on `src-tauri/**` changes.

### 8.2 Recorded test results (evidence only where recorded)

- `[VERIFIED]` SDD ledger (persistence/autosync plan, Task 11): `npm test` → 90 passed (12 files); final state after fixes → 96/96; `npm run build` → success.
- `[VERIFIED]` SDD ledger (autolog redo, Task 5): final verification — `npm test` → 115/115; `npm run build` → green; Rust verified by inspection (cargo unavailable).
- `[VERIFIED]` Rust pagination tests added at `f12ff7b`: initial query body, next-cursor body, `should_fetch_next`, `merge_query_pages` variants (dedupe, closed pagination, first request id, empty/missing results).
- **[UNKNOWN]** Whether the newly added CI workflow has run to success in GitHub Actions (run history not inspected from this environment).
- **[VERIFIED]** Manual testing: Playwright screenshot harness (`docs/mockups/snap.mjs`, `probe.mjs`) against local dev server; mockups committed under `docs/mockups/`.

### 8.3 Known limitations

- `[UNKNOWN]` Manual-only verification status for the Tauri GUI itself.
- `[UNKNOWN]` No recorded post-v0.1.1 functional test suite coverage for the paginated Notion fetch at the component level beyond Rust tests and existing App tests mocking `notion_query_incomplete` with single-page shapes.

---

## 9. Current State

### 9.1 Snapshot

- **Version:** `0.1.1` metadata at HEAD (restored by `dff0ca6`).
- **HEAD:** `2d666be79086f553fb3f0c177a052b17caca271e` — *"fix: flatten notion query results pages in pagination merge"* (2026-11-24 13:34:45 UTC).
- **Branch:** `main`; working tree otherwise clean apart from noted uncommitted deletions and untracked artifacts.

### 9.2 Implemented functionality at HEAD (batch-sync era)

- Frameless, transparent, always-on-top 220×220 window (constraints currently **not** re-applied after the `f12ff7b` revert).
- Paper: Markdown checklist, quick-add, EDIT .MD / DONE (RENDER) / ↻, time pills, checkbox interactions.
- Chassis: timer/stopwatch, LCD, presets, keycaps, LOG key (batch), settings, theme toggle, session-end prompt, minimize/close.
- Notion: `notion_log_batch` (batch check sync) + paginated `notion_query_incomplete`.
- Frontend tests: tasks, time, timekeeper, drag, Notion, hooks, App.

### 9.3 Not implemented at HEAD (autosync-era work reverted)

- Task persistence to localStorage; inline rename/delete; vanish-on-check; pending-ops queue; autosync/flush engine; `NOTION ↗` key; progress ops; event-driven autolog wiring.

### 9.4 In progress / outstanding

- `[UNKNOWN]` Intended direction after the `f12ff7b` revert (why autosync stack was rolled back).
- Outstanding technical debt / discrepancies:
  - Version metadata restored; window-lock config and `core:window:allow-destroy` capability not restored after `f12ff7b`.
  - Uncommitted deletions in working tree of autosync-era files (`src/lib/sync.ts`, `src/lib/sync.test.ts`, `src/hooks/usePendingOps.ts`, `src/hooks/usePendingOps.test.ts`, `src/components/Paper.test.tsx`) — tracked in `HEAD` but absent from working tree.
  - README currently documents the batch-sync era feature set.

### 9.5 Future roadmap

- Re-validate whether the local-first autosync design should be re-introduced on top of the paginated Notion fetch.
- Re-apply v0.1.1 window-lock constraints if the compact-layout regression is accepted as current behavior.
- Continue PDF preparation.

---

## 10. Lessons Learned

- **Locked interfaces early:** pinning the task object and Notion property contract in the design phase prevented drift across the persistence and autosync implementations.
- **Optimistic UI needs an escape hatch:** local-first writes require queueing, coalescing, flush ordering, and merge filtering; naïve implementations resurface or duplicate tasks.
- **Effectful code reviews catch structural issues:** fix rounds (interval identity churn, concurrent flushes, page-id backfill) were driven by review findings before user impact.
- **Small surfaces fail loudly:** missing Notion version header, Tailwind entry, and window constraints each produced user-visible breakage discovered late; small fixes with version bumps followed.
- **Pagination is a data-shape commitment:** switching from single-page assumptions to cursor-based pagination required merge logic, dedupe, caps, and error propagation — and later flattening fixes.
- **Metadata vs. behavior:** version regressions can be metadata-only while behavior changes silently; keep release notes precise.

---

## 11. Maintenance Protocol

Whenever a significant milestone is completed during ongoing development:

1. **Add a dated entry** to the appropriate section (timeline, challenges, decisions, releases, testing, current state, lessons).
2. **Record the commit hash** (`git rev-parse --short HEAD`).
3. **Describe what changed and why.**
4. **Record test/build evidence** (commands and results) — never present an unverified test as passing.
5. **Update the Current State section** if the version, architecture, or shipped functionality changed.

**Significant milestones include:** new features; architectural changes; major bug fixes; regressions and reversions; debugging discoveries; releases; major testing milestones.

**Not recorded:** trivial commits (chores, docs-only wording, patch-level fixes) unless they carry milestone weight.

---

## 12. Milestone Summary and Historical Coverage Gaps

### 12.1 Discovered milestones (summary)

- Product founding & v0.1.0 (2026-11-18).
- v0.1.1 window-lock release (2026-11-19).
- Design → plan → implementation of persistence, inline editing, and local-first autosync (2026-11-19 → 2026-11-22).
- Event-driven autolog redo (2026-11-22).
- Notion query pagination implementation + merge fix, version regression/correction, Rust CI, final HEAD fix (2026-11-24).

### 12.2 Gaps in available history

- **[UNKNOWN]** Pre-2026-11-18 history: no commits precede the initial design-docs commit; origins are reconstructed from the first design doc.
- **[UNKNOWN]** Motivation for the 2026-11-24 broad revert is not recorded in commit messages or docs.
- **[UNKNOWN]** CI run outcomes and runtime QA evidence beyond locally recorded unit/build results.
- **[UNKNOWN]** Post-v0.1.1 release activity beyond the two tagged releases and later commits.
- **[VERIFIED]** Working-tree-only deletions of five autosync-era files indicate local state that is not yet committed; these should be reconciled before further papertrail updates.

---

## Appendix A — Sources inspected (checklist)

- Git: full history, branches, tags, working tree, diffs, per-path history, tagged-release diffs (`v0.1.0`…`v0.1.1`, `f12ff7b`…`HEAD`).
- Docs: design specs, plans, SDD ledgers, task briefs, review diffs, README, mockups.
- Code: frontend (App, components, hooks, lib, CSS), backend (Rust commands, Tauri config/capabilities), CI, config.
- Artifacts: `archive/Versions/**`, `docs/mockups/**`, `typewriter_timekeeper_visual_reference.html`, `dist/`.

## Appendix B — Notes for future PDF preparation

- Keep heading hierarchy clear; use chronological tables; keep technical explanations short.
- The eventual PDF should read like a well-documented engineering journey, not a terminal dump; avoid raw Git logs and walls of text.
- Preserve mistakes, regressions, reversions, and lessons — do not rewrite history to look cleaner.

---

*This living document will be updated as significant milestones occur; see Section 11 (Maintenance Protocol).*
