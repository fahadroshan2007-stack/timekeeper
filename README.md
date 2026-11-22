# TimeKeeper — Typewriter Focus Widget

A frameless, transparent, always-on-top desktop widget for task tracking and time keeping, built with Tauri v2 + React 19 + TypeScript + Tailwind CSS.

The widget looks like a retro typewriter sitting on your desktop: a sheet of paper rolls out of the top to hold your tasks, and the chassis below carries the controls — including a countdown timer (Pomodoro) and a stopwatch — with a small LCD display and mechanical keys.

## Features

- **Floating widget**: frameless, transparent, always on top; drag it by the chassis (non-interactive area).
- **The paper**: paste a Markdown task list (`- [ ] task`), it parses into an interactive checklist. Double-click a task title to rename it inline (Enter/blur commits, Esc cancels); click the ✕ at the row end to delete it.
- **Persistent tasks**: the checklist and raw Markdown buffer survive restarts (localStorage keys `timekeeper.tasks.v1` and `timekeeper.markdown.v1`). Checking a task strikes it through, animates it away, and removes it from the paper.
- **Local-first Notion autosync**: `•••` opens settings for `NOTION_API_KEY` / `NOTION_DATABASE_ID` (stored locally). Changes are written locally first and queued in `timekeeper.pendingOps.v1`; the queue flushes in a single batch every 30 s, on launch, and when you press ↻. Offline changes wait in the queue and flush when you're back online. On launch and ↻, pending ops are flushed *before* incomplete tasks are fetched, and pages backing a queued check/delete are filtered out so they can't reappear.
- **Notion behavior**: checking a task sets `Status → Done`, `Time (Min)` from its accumulated minutes, and `Logged At = now`; renaming patches the page title; deleting archives the page (Notion trash — the only delete the API offers). New tasks omit `Status` so your database default ("Not Started") applies. Failures keep the ops queued for retry and show a toast.
- **NOTION ↗ key**: the red key in the chassis opens your Notion database in the browser (requires a database id in settings).
- **Timekeeper**: toggle **Timer** (countdown, default 25:00) / **Stopwatch** (count up); Start / Pause / Resume / Reset / Stop. When a session ends, you are prompted to assign the tracked minutes to the active task; sessions under 15 seconds are discarded automatically.
- **Pill badges**: accumulated minutes appear as a badge (e.g. `25m`) next to each task.

## Download

**[v0.1.1](https://github.com/fahadroshan2007-stack/timekeeper/releases/tag/v0.1.1)** — [`TimeKeeper_0.1.1_x64_en-US.msi`](https://github.com/fahadroshan2007-stack/timekeeper/releases/download/v0.1.1/TimeKeeper_0.1.1_x64_en-US.msi) (installer), [`TimeKeeper_0.1.1_x64-setup.exe`](https://github.com/fahadroshan2007-stack/timekeeper/releases/download/v0.1.1/TimeKeeper_0.1.1_x64-setup.exe) (NSIS installer), or [`timekeeper.exe`](https://github.com/fahadroshan2007-stack/timekeeper/releases/download/v0.1.1/timekeeper.exe) (portable). Unsigned — SmartScreen: More info → Run anyway.

## License

[MIT](LICENSE) — do whatever you like, just keep the notice.

## Development

```bash
npm install        # frontend deps
npm run dev        # vite dev server (port 1420)
npm run tauri dev  # run the Tauri shell (requires Rust toolchain)
npm test           # vitest
npm run build      # tsc + vite build
```

Notion sync goes through Rust Tauri commands (`src-tauri/src/commands/notion.rs`) to avoid CORS issues in the webview.

## Docs

- Design: `docs/superpowers/specs/2026-11-18-tauri-typewriter-focus-widget-design.md`
- Plan: `docs/superpowers/plans/2026-11-18-tauri-typewriter-focus-widget.md`
- Mockup: `docs/mockups/typewriter-widget-mockup.html`
