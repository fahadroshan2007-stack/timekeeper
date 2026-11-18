import { useCallback, useEffect, useRef, useState } from "react";
import Paper from "./components/Paper";
import Chassis from "./components/Chassis";
import SettingsModal from "./components/SettingsModal";
import SessionEndPrompt from "./components/SessionEndPrompt";
import { useTaskList } from "./hooks/useTaskList";
import { useTimekeeperSession } from "./hooks/useTimekeeperSession";
import { attachChassisDrag } from "./lib/windowDrag";
import { fetchIncompleteTasks, runBatchSync } from "./lib/notion";
import type { TimekeeperMode } from "./lib/timekeeper";

const TIMER_SECONDS = 25 * 60;
const API_KEY_STORAGE = "timekeeper.notion.apiKey";
const DB_ID_STORAGE = "timekeeper.notion.databaseId";
const TOAST_MS = 4500;

export default function App() {
  const [markdown, setMarkdown] = useState(
    "- [ ] Study for exam\n- [ ] Read 20 pages\n- [ ] Practice problems"
  );
  const [showInput, setShowInput] = useState(true);
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
  const [mode, setMode] = useState<TimekeeperMode>("timer");

  const {
    tasks,
    addTaskList,
    toggleTask,
    assignAccumulatedMinutes,
    removeTask,
    mergeFetched,
  } = useTaskList("");
  const session = useTimekeeperSession({ mode, initialSeconds: TIMER_SECONDS });

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
    return attachChassisDrag(el);
  }, []);

  const refreshFromNotion = useCallback(
    async (key = apiKey, dbId = databaseId, announce = true) => {
      if (!key || !dbId) {
        if (announce) showToast("Set your Notion key + database in … first.");
        return;
      }
      try {
        const fetched = await fetchIncompleteTasks({ apiKey: key, databaseId: dbId });
        mergeFetched(fetched);
        if (announce) showToast(`Synced ${fetched.length} task(s) from Notion.`);
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

  const handleLog = useCallback(async () => {
    const checked = tasks.filter((task) => task.isChecked);
    if (checked.length === 0) {
      showToast("No checked tasks to log.");
      return;
    }
    if (!apiKey || !databaseId) {
      showToast("Set your Notion key + database in … first.");
      return;
    }
    setLogging(true);
    try {
      const results = await runBatchSync({ apiKey, databaseId, tasks: checked });
      const okIds = results
        .filter((r) => r.ok)
        .map((r) => r.taskId);
      const failed = results.filter((r) => !r.ok);
      for (const id of okIds) removeTask(id);
      if (failed.length > 0) {
        const first = failed[0];
        showToast(`Failed to sync ${failed.length} task(s) — kept on paper. ${first.error ?? ""}`);
      } else {
        showToast(`Logged ${okIds.length} task(s) to Notion ✓`);
      }
    } catch (error) {
      showToast(
        `Notion sync failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setLogging(false);
    }
  }, [tasks, apiKey, databaseId, removeTask, showToast]);

  const taskOptions = tasks.map(({ localId, title }) => ({ localId, title }));

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
      <Paper
        markdown={markdown}
        onMarkdownChange={setMarkdown}
        showInput={showInput}
        tasks={tasks}
        activeTaskId={activeTaskId}
        onToggleTask={toggleTask}
        onActivateTask={handleActivate}
        onLoad={handleLoad}
        onEdit={() => setShowInput(true)}
        onRefresh={() => refreshFromNotion(apiKey, databaseId, true)}
      />

      <div ref={chassisRef} data-testid="chassis-drag" className="flex min-h-0 flex-1 flex-col">
        <Chassis
          mode={mode}
          status={session.status}
          displaySeconds={session.displaySeconds}
          onModeChange={setMode}
          onStart={session.start}
          onPause={session.pause}
          onResume={session.resume}
          onReset={session.reset}
          onStop={session.stop}
          logging={logging}
          onLog={handleLog}
          onSettings={() => setSettingsOpen(true)}
        />
      </div>

      <SessionEndPrompt
        open={session.promptOpen}
        elapsedSeconds={session.promptMinutes * 60}
        taskOptions={taskOptions}
        activeTaskId={activeTaskId}
        onAssign={(taskId) => {
          assignAccumulatedMinutes(taskId, session.promptMinutes);
          session.discardPrompt();
        }}
        onDiscard={session.discardPrompt}
      />

      <SettingsModal
        open={settingsOpen}
        apiKey={apiKey}
        databaseId={databaseId}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {toast && (
        <div
          data-testid="toast"
          role="status"
          className="pointer-events-none absolute bottom-3 left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-lg border border-[#c9a959] bg-[#121622]/95 px-3 py-1.5 font-mono text-[11px] text-[#f5c518] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
