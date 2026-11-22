import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import Paper from "./components/Paper";
import Roller from "./components/Roller";
import Chassis from "./components/Chassis";
import SettingsModal from "./components/SettingsModal";
import SessionEndPrompt from "./components/SessionEndPrompt";
import { useTaskList } from "./hooks/useTaskList";
import { usePendingOps } from "./hooks/usePendingOps";
import { useTimekeeperSession } from "./hooks/useTimekeeperSession";
import { attachChassisDrag } from "./lib/windowDrag";
import { fetchIncompleteTasks } from "./lib/notion";
import { filterFetched } from "./lib/sync";
import { tasksToMarkdown, type Task } from "./lib/tasks";
import type { TimekeeperMode } from "./lib/timekeeper";

const API_KEY_STORAGE = "timekeeper.notion.apiKey";
const DB_ID_STORAGE = "timekeeper.notion.databaseId";
const MARKDOWN_STORAGE = "timekeeper.markdown.v1";
const TOAST_MS = 4000;

export default function App() {
  const [markdown, setMarkdown] = useState(
    () => localStorage.getItem(MARKDOWN_STORAGE) ?? ""
  );
  const [showInput, setShowInput] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [vanishingTasks, setVanishingTasks] = useState<Task[]>([]);
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(API_KEY_STORAGE) ?? ""
  );
  const [databaseId, setDatabaseId] = useState(
    () => localStorage.getItem(DB_ID_STORAGE) ?? ""
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
    renameTask,
  } = useTaskList();
  const { ops, enqueue, flush } = usePendingOps({ apiKey, databaseId });
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const flushNow = useCallback(async () => flush(), [flush]);
  const session = useTimekeeperSession({ mode, initialSeconds: timerPreset * 60 });

  const chassisRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // Persist the raw markdown buffer independently of the rendered task list.
  useEffect(() => {
    localStorage.setItem(MARKDOWN_STORAGE, markdown);
  }, [markdown]);

  // Keep the markdown buffer in sync with task edits (check/delete/rename/quick-add/merge).
  const prevTasksRef = useRef(tasks);
  useEffect(() => {
    if (prevTasksRef.current === tasks) return;
    prevTasksRef.current = tasks;
    setMarkdown(tasksToMarkdown(tasks));
  }, [tasks]);

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
        // Never resurrect a page that backs a queued done/trash op.
        mergeFetched(filterFetched(fetched, opsRef.current));
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

  // Flush queued ops in the background every 30 s.
  useEffect(() => {
    const id = window.setInterval(() => {
      void flushNow();
    }, 30000);
    return () => window.clearInterval(id);
  }, [flushNow]);

  // On launch: flush anything queued while offline, then pull fresh tasks.
  const didLoad = useRef(false);
  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    if (apiKey && databaseId) {
      void (async () => {
        await flushNow();
        await refreshFromNotion(apiKey, databaseId, false);
      })();
    }
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

  const handleToggleTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.localId === taskId);
      if (!task) return;
      if (task.isChecked) {
        // Pasted checked rows can be unchecked.
        toggleTask(taskId);
        return;
      }
      enqueue({
        kind: "done",
        localId: task.localId,
        notionPageId: task.notionPageId,
        title: task.title,
        accumulatedMinutes: task.accumulatedMinutes,
      });
      setVanishingTasks((v) => [...v, { ...task, isChecked: true }]);
      removeTask(taskId);
      window.setTimeout(() => {
        setVanishingTasks((v) => v.filter((t) => t.localId !== taskId));
      }, 450);
    },
    [tasks, enqueue, toggleTask, removeTask]
  );

  const handleRenameTask = useCallback(
    (taskId: string, title: string) => {
      const task = tasks.find((t) => t.localId === taskId);
      const trimmed = title.trim();
      if (!task || !trimmed) return;
      renameTask(taskId, trimmed);
      enqueue({
        kind: "rename",
        localId: taskId,
        notionPageId: task.notionPageId,
        title: trimmed,
      });
    },
    [tasks, renameTask, enqueue]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.localId === taskId);
      if (!task) return;
      enqueue({
        kind: "trash",
        localId: taskId,
        notionPageId: task.notionPageId,
      });
      removeTask(taskId);
    },
    [tasks, enqueue, removeTask]
  );

  const handleQuickAdd = useCallback(
    (title: string) => {
      const id = crypto.randomUUID();
      addSingleTask(title, id);
      if (!title.trim()) return;
      enqueue({ kind: "create", localId: id, title: title.trim() });
      // Keep the raw markdown in sync so a later DONE (RENDER) can't drop it.
      setMarkdown((prev) => {
        const trimmed = title.trim();
        const line = `- [ ] ${trimmed}`;
        return prev.trim() ? `${prev.replace(/\s+$/, "")}\n${line}` : line;
      });
    },
    [addSingleTask, enqueue]
  );

  const handleRefresh = useCallback(
    async (key: string, dbId: string, announce: boolean) => {
      if (!key || !dbId) {
        if (announce) showToast("Set your Notion key + database in ••• first.");
        return;
      }
      const result = await flushNow();
      if (!result.ok && announce) showToast("SYNC FAILED — WILL RETRY");
      await refreshFromNotion(key, dbId, announce);
    },
    [flushNow, refreshFromNotion, showToast]
  );

  const handleSaveSettings = useCallback(
    (key: string, dbId: string) => {
      setApiKey(key);
      setDatabaseId(dbId);
      localStorage.setItem(API_KEY_STORAGE, key);
      localStorage.setItem(DB_ID_STORAGE, dbId);
      setSettingsOpen(false);
      showToast("Settings saved. Fetching tasks…");
      void handleRefresh(key, dbId, true);
    },
    [handleRefresh, showToast]
  );

  const openNotionDb = useCallback(() => {
    if (!databaseId) {
      showToast("SET YOUR NOTION KEY IN ••• FIRST");
      return;
    }
    openUrl(`https://www.notion.so/${databaseId.replace(/-/g, "")}`).catch(() =>
      showToast("COULDN'T OPEN NOTION")
    );
  }, [databaseId, showToast]);

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
        vanishingTasks={vanishingTasks}
        activeTaskId={activeTaskId}
        onToggleTask={handleToggleTask}
        onActivateTask={handleActivate}
        onRenameTask={handleRenameTask}
        onDeleteTask={handleDeleteTask}
        onLoad={handleLoad}
        onEdit={() => setShowInput((v) => !v)}
        onRefresh={() => void handleRefresh(apiKey, databaseId, true)}
        onQuickAdd={handleQuickAdd}
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
          onOpenNotion={openNotionDb}
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
