import { elapsedSecondsToMinutes } from "../lib/time";

export interface SessionEndPromptTask {
  localId: string;
  title: string;
}

interface SessionEndPromptProps {
  open: boolean;
  elapsedSeconds: number;
  taskOptions: SessionEndPromptTask[];
  activeTaskId: string | null;
  activeTaskTitle?: string | null;
  onAssign: (taskId: string, minutes: number) => void;
  onDiscard: () => void;
}

function truncate(text: string, max = 22): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function SessionEndPrompt({
  open,
  elapsedSeconds,
  taskOptions,
  activeTaskId,
  activeTaskTitle,
  onAssign,
  onDiscard,
}: SessionEndPromptProps) {
  if (!open) return null;

  const minutes = elapsedSecondsToMinutes(elapsedSeconds);

  if (taskOptions.length === 0) {
    return (
      <div data-testid="session-end-prompt" className="session-ribbon">
        <p className="ribbon-headline">No tasks on the paper to log this session.</p>
        <div className="ribbon-actions">
          <button type="button" data-testid="session-discard" onClick={onDiscard} className="ribbon-btn">
            DISCARD
          </button>
        </div>
      </div>
    );
  }

  const activeValid =
    activeTaskId !== null && taskOptions.some((t) => t.localId === activeTaskId);
  const targetId = activeValid && activeTaskId ? activeTaskId : taskOptions[0].localId;

  return (
    <div data-testid="session-end-prompt" className="session-ribbon">
      <p className="ribbon-headline">
        {activeValid
          ? `⏱ Save ${minutes}m to "${truncate(activeTaskTitle ?? "active task")}"?`
          : `⏱ Assign ${minutes}m session to:`}
      </p>
      {!activeValid && (
        <select
          data-testid="session-task-select"
          className="ribbon-select"
          value={targetId}
          onChange={(e) => onAssign(e.target.value, minutes)}
        >
          {taskOptions.map((task) => (
            <option key={task.localId} value={task.localId}>
              {task.title}
            </option>
          ))}
        </select>
      )}
      <div className="ribbon-actions">
        <button type="button" data-testid="session-discard" onClick={onDiscard} className="ribbon-btn">
          DISCARD
        </button>
        <button
          type="button"
          data-testid="session-save"
          className="ribbon-btn primary"
          onClick={() => onAssign(targetId, minutes)}
        >
          SAVE TIME
        </button>
      </div>
    </div>
  );
}
