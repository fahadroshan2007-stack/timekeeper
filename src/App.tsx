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
import { filterFetched, statusFor } from "./lib/sync";
import { tasksToMarkdown, type Task } from "./lib/tasks";
import type { TimekeeperMode } from "./lib/timekeeper";

const API_KEY_STORAGE = "timekeeper.notion.apiKey";
const DB_ID_STORAGE = "timekeeper.notion.databaseId";
const MARKDOWN_STORAGE = "timekeeper.markdown.v1";
const TOAST_MS = 4000;
const FLUSH_DEBOUNCE_MS = 1000;

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
    applyPageIds,
  } = useTaskList();
  const { ops, enqueue, enqueueProgress, flush } = usePendingOps({ apiKey, databaseId });
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const flushNow = useCallback(async () => {
    const result = await flush();
    if (result.backfills.length > 0) applyPageIds(result.backfills);
    return result;
  }, [flush, applyPageIds]);
  const flushNowRef = useRef(flushNow);
  flushNowRef.current = flushNow;
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  // Design: ~1 s after an update burst, coalesce into a single debounced flush.
  const scheduleFlush = useCallback(() => {
    clearFlushTimer();
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flushNowRef.current();
    }, FLUSH_DEBOUNCE_MS);
  }, [clearFlushTimer]);

  // Cancel any pending debounced flush when the widget unmounts.
  useEffect(() => clearFlushTimer, [clearFlushTimer]);
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

  // Design: event-driven autolog — no periodic flush. Flush on reconnect,
  // app close, manual refresh, launch, or a debounced update burst.
  useEffect(() => {
    const handleOnline = () => {
      void flushNowRef.current();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // Design: app close -> preventDefault -> final flushNow() -> destroy().
  // If the final flush fails, the ops stay queued and the close proceeds.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        await flushNowRef.current();
        await getCurrentWindow().destroy();
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // Listener unavailable — fall through to a normal close.
      });
    return () => {
      unlisten?.();
    };
  }, []);

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

  // Design: sweep undone tasks into progress ops (Status via statusFor(minutes)).
  // Used on check / time assign / rename / delete so Notion mirrors local state.
  const sweepUndoneTasks = useCallback(
    (taskList: Task[]) => {
      for (const task of taskList) {
        if (task.isChecked) continue;
        const minutes = task.accumulatedMinutes;
        enqueueProgress({
          kind: "progress",
          localId: task.localId,
          notionPageId: task.notionPageId,
          title: task.title,
          status: statusFor(minutes),
          accumulatedMinutes: minutes,
        });
      }
    },
    [enqueueProgress]
  );

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
      // Design: check -> done for the task, sweep the remaining undone tasks.
      sweepUndoneTasks(tasks.filter((t) => t.localId !== taskId && !t.isChecked));
      scheduleFlush();
    },
    [tasks, enqueue, toggleTask, removeTask, sweepUndoneTasks, scheduleFlush]
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
      sweepUndoneTasks(tasks.filter((t) => !t.isChecked));
      scheduleFlush();
    },
    [tasks, renameTask, enqueue, sweepUndoneTasks, scheduleFlush]
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
      sweepUndoneTasks(tasks.filter((t) => t.localId !== taskId && !t.isChecked));
      scheduleFlush();
    },
    [tasks, enqueue, removeTask, sweepUndoneTasks, scheduleFlush]
  );

  const handleQuickAdd = useCallback(
    (title: string) => {
      const id = crypto.randomUUID();
      addSingleTask(title, id);
      if (!title.trim()) return;
      // Design: task created -> enqueue createProgress (Status "Not Started", Time 0).
      enqueueProgress({
        kind: "progress",
        localId: id,
        notionPageId: null,
        title: title.trim(),
        status: statusFor(0),
        accumulatedMinutes: 0,
      });
      scheduleFlush();
      // Keep the raw markdown in sync so a later DONE (RENDER) can't drop it.
      setMarkdown((prev) => {
        const trimmed = title.trim();
        const line = `- [ ] ${trimmed}`;
        return prev.trim() ? `${prev.replace(/\s+$/, "")}\n${line}` : line;
      });
    },
    [addSingleTask, enqueueProgress, scheduleFlush]
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
        const task = tasks.find((t) => t.localId === taskId);
        assignAccumulatedMinutes(taskId, session.promptMinutes);
        session.discardPrompt();
        // Design: time updated -> sweep undone tasks into progress ops.
        if (task) {
          sweepUndoneTasks([
            { ...task, accumulatedMinutes: task.accumulatedMinutes + session.promptMinutes },
          ]);
        }
        scheduleFlush();
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
