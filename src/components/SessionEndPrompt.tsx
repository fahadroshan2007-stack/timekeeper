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
  onAssign: (taskId: string, minutes: number) => void;
  onDiscard: () => void;
}

export default function SessionEndPrompt({
  open,
  elapsedSeconds,
  taskOptions,
  activeTaskId,
  onAssign,
  onDiscard,
}: SessionEndPromptProps) {
  if (!open) return null;

  const minutes = elapsedSecondsToMinutes(elapsedSeconds);

  if (taskOptions.length === 0) {
    return (
      <div data-testid="session-end-prompt">
        <p>No tasks available to log this session.</p>
        <button data-testid="session-discard" onClick={onDiscard}>Discard</button>
      </div>
    );
  }

  const assignedTaskId = activeTaskId && taskOptions.some((t) => t.localId === activeTaskId)
    ? activeTaskId
    : taskOptions[0].localId;

  return (
    <div data-testid="session-end-prompt">
      <p>Session ended. Log {minutes} minute(s) to an active task?</p>
      <select
        data-testid="session-task-select"
        value={assignedTaskId}
        onChange={(e) => onAssign(e.target.value, minutes)}
      >
        {taskOptions.map((task) => (
          <option key={task.localId} value={task.localId}>{task.title}</option>
        ))}
      </select>
      <button data-testid="session-save" onClick={() => onAssign(assignedTaskId, minutes)}>Save</button>
      <button data-testid="session-discard" onClick={onDiscard}>Discard</button>
    </div>
  );
}
