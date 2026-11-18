# TimeKeeper — Typewriter Focus Widget

A frameless, transparent, always-on-top desktop widget for task tracking and time keeping, built with Tauri v2 + React 19 + TypeScript + Tailwind CSS.

The widget looks like a retro typewriter sitting on your desktop: a sheet of paper rolls out of the top to hold your tasks, and the chassis below carries the controls — including a countdown timer (Pomodoro) and a stopwatch — with a small LCD display and mechanical keys.

## Features

- **Floating widget**: frameless, transparent, always on top; drag it by the chassis (non-interactive area).
- **The paper**: paste a Markdown task list (`- [ ] task`), it parses into an interactive checklist; click the strike-through checkbox to check off.
- **Notion sync**: `…` in the chassis header opens settings for `NOTION_API_KEY` / `NOTION_DATABASE_ID` (stored locally). On launch, incomplete tasks are fetched from Notion and shown on the paper; the red **LOG** key batch-syncs checked tasks to Notion (`Status → Done`, `Time (Min)` from each task's accumulated minutes, `Logged At` = now). Failures keep the tasks on the paper and show a toast.
- **Timekeeper**: toggle **Timer** (countdown, default 25:00) / **Stopwatch** (count up); Start / Pause / Resume / Reset / Stop. When a session ends, you are prompted to assign the tracked minutes to the active task; sessions under 15 seconds are discarded automatically.
- **Pill badges**: accumulated minutes appear as a badge (e.g. `25m`) next to each task.

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
