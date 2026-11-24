import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Paper from "./components/Paper";
import Roller from "./components/Roller";
import Chassis from "./components/Chassis";
import SettingsModal from "./components/SettingsModal";
import SessionEndPrompt from "./components/SessionEndPrompt";
import { useTaskList } from "./hooks/useTaskList";
import { useTimekeeperSession } from "./hooks/useTimekeeperSession";
import { attachChassisDrag } from "./lib/windowDrag";
import { fetchIncompleteTasks, runBatchSync } from "./lib/notion";
import type { TimekeeperMode } from "./lib/timekeeper";

const API_KEY_STORAGE = "timekeeper.notion.apiKey";
const DB_ID_STORAGE = "timekeeper.notion.databaseId";
const TOAST_MS = 4000;

const SAMPLE_MARKDOWN =
  "- [ ] Study for exam\n- [ ] Read 20 pages\n- [ ] Practice problems";

export default function App() {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN);
  const [showInput, setShowInput] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(API_KEY_STORAGE) ?? ""
  );
  const [databaseId, setDatabaseId] = useState(
    () => localStorage.getItem(DB_ID_STORAGE) ?? ""
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [loggingIds, setLoggingIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<TimekeeperMode>("timer");
  const [timerPreset, setTimerPreset] = useState(25);
  const [theme, setTheme] = useState<"espresso" | "late">(() =>
    localStorage.getItem("timekeeper.theme") === "late" ? "late" : "espresso"
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "late" ? "espresso" : "late";
      localStorage.setItem("timekeeper.theme", next);
      return next;
    });
  }, []);

  const {
    tasks,
    addTaskList,
    toggleTask,
    assignAccumulatedMinutes,
    removeTask,
    mergeFetched,
    addSingleTask,
  } = useTaskList(SAMPLE_MARKDOWN);
  const session = useTimekeeperSession({ mode, initialSeconds: timerPreset * 60 });

  const chassisRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // Drag the widget by grabbing the chassis (non-interactive area).
  useEffect(() => {
    const el = chassisRef.current;
    if (!el) return;
    return attachChassisDrag(el, {
      onError: (error) =>
        showToast(
          `Drag failed: ${error instanceof Error ? error.message : String(error)}`
        ),
    });
  }, [showToast]);

  const refreshFromNotion = useCallback(
    async (key = apiKey, dbId = databaseId, announce = true) => {
      if (!key || !dbId) {
        if (announce) showToast("Set your Notion key + database in ••• first.");
        return;
      }
      try {
        const fetched = await fetchIncompleteTasks({ apiKey: key, databaseId: dbId });
        mergeFetched(fetched);
        if (announce) {
          showToast(
            fetched.length === 0
              ? "Notion connected — no incomplete tasks (all Done)."
              : `Synced ${fetched.length} task(s) from Notion.`
          );
        }
      } catch (error) {
        showToast(
          `Notion refresh failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    [apiKey, databaseId, mergeFetched, showToast]
  );

  // Load incomplete Notion tasks on mount (if credentials are stored).
  const didLoad = useRef(false);
  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    if (apiKey && databaseId) refreshFromNotion(apiKey, databaseId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-prompt when the countdown reaches zero.
  useEffect(() => {
    if (mode === "timer" && session.status === "running" && session.displaySeconds === 0) {
      session.stop();
    }
  }, [mode, session.status, session.displaySeconds, session]);

  const handleLoad = useCallback(() => {
    addTaskList(markdown);
    setShowInput(false);
  }, [addTaskList, markdown]);

  const handleActivate = useCallback((taskId: string) => {
    setActiveTaskId((prev) => (prev === taskId ? null : taskId));
  }, []);

  const handleQuickAdd = useCallback(
    (title: string) => {
      addSingleTask(title);
      // Keep the raw markdown in sync so a later DONE (RENDER) can't drop it.
      setMarkdown((prev) => {
        const trimmed = title.trim();
        if (!trimmed) return prev;
        const line = `- [ ] ${trimmed}`;
        return prev.trim() ? `${prev.replace(/\s+$/, "")}\n${line}` : line;
      });
    },
    [addSingleTask]
  );

  const handleSaveSettings = useCallback(
    (key: string, dbId: string) => {
      setApiKey(key);
      setDatabaseId(dbId);
      localStorage.setItem(API_KEY_STORAGE, key);
      localStorage.setItem(DB_ID_STORAGE, dbId);
      setSettingsOpen(false);
      showToast("Settings saved. Fetching tasks…");
      refreshFromNotion(key, dbId, true);
    },
    [refreshFromNotion, showToast]
  );

  const handleMinimize = useCallback(() => {
    getCurrentWindow()
      .minimize()
      .catch((error) => showToast(`Minimize failed: ${String(error)}`));
  }, [showToast]);

  const handleClose = useCallback(() => {
    getCurrentWindow()
      .close()
      .catch((error) => showToast(`Close failed: ${String(error)}`));
  }, [showToast]);

  const handleLog = useCallback(async () => {
    const checked = tasks.filter((task) => task.isChecked);
    if (checked.length === 0) {
      showToast("NO CHECKED TASKS TO LOG");
      return;
    }
    if (!apiKey || !databaseId) {
      showToast("SET YOUR NOTION KEY IN ••• FIRST");
      return;
    }
    setLogging(true);
    try {
      const results = await runBatchSync({ apiKey, databaseId, tasks: checked });
      const okIds = results.filter((r) => r.ok).map((r) => r.taskId);
      const failed = results.filter((r) => !r.ok);
      // Roll the synced rows up before removing them from the paper.
      setLoggingIds(new Set(okIds));
      window.setTimeout(() => {
        for (const id of okIds) removeTask(id);
        setLoggingIds(new Set());
      }, 300);
      if (failed.length > 0) {
        const first = failed[0];
        showToast(`SYNC FAILED ×${failed.length} — KEPT ON PAPER`);
        console.error("Notion sync failures:", first.error);
      } else {
        showToast(`SYNCED ${okIds.length} TO NOTION ✓`);
      }
    } catch (error) {
      showToast(
        `NOTION SYNC FAILED: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setLogging(false);
    }
  }, [tasks, apiKey, databaseId, removeTask, showToast]);

  const activeTask = tasks.find((task) => task.localId === activeTaskId) ?? null;
  const taskOptions = tasks.map(({ localId, title }) => ({ localId, title }));

  const sessionPrompt = (
    <SessionEndPrompt
      open={session.promptOpen}
      elapsedSeconds={session.promptMinutes * 60}
      taskOptions={taskOptions}
      activeTaskId={activeTaskId}
      activeTaskTitle={activeTask?.title ?? null}
      onAssign={(taskId) => {
        assignAccumulatedMinutes(taskId, session.promptMinutes);
        session.discardPrompt();
      }}
      onDiscard={session.discardPrompt}
    />
  );

  return (
    <div className="typewriter-widget" data-theme={theme}>
      <Paper
        markdown={markdown}
        onMarkdownChange={setMarkdown}
        showInput={showInput}
        tasks={tasks}
        activeTaskId={activeTaskId}
        onToggleTask={toggleTask}
        onActivateTask={handleActivate}
        onLoad={handleLoad}
        onEdit={() => setShowInput((v) => !v)}
        onRefresh={() => refreshFromNotion(apiKey, databaseId, true)}
        onQuickAdd={handleQuickAdd}
        loggingIds={loggingIds}
      />

      <Roller />

      <div ref={chassisRef} data-testid="chassis-drag" className="flex min-h-0 flex-1 flex-col">
        <Chassis
          mode={mode}
          status={session.status}
          displaySeconds={session.displaySeconds}
          elapsedSeconds={session.elapsedSeconds}
          timerPreset={timerPreset}
          activeLabel={activeTask ? activeTask.title : null}
          sessionPrompt={sessionPrompt}
          onModeChange={setMode}
          onStart={session.start}
          onPause={session.pause}
          onResume={session.resume}
          onReset={session.reset}
          onStop={session.stop}
          logging={logging}
          onLog={handleLog}
          onSettings={() => setSettingsOpen(true)}
          onMinimize={handleMinimize}
          onClose={handleClose}
          theme={theme}
          onToggleTheme={toggleTheme}
          onTimerPreset={setTimerPreset}
        />
      </div>

      <SettingsModal
        open={settingsOpen}
        apiKey={apiKey}
        databaseId={databaseId}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {toast && (
        <div data-testid="toast" role="status" className="stamp-toast">
          {toast}
        </div>
      )}
    </div>
  );
}
