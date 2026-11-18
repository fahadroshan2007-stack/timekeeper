import { useState } from "react";
import type { Task } from "../lib/tasks";

interface PaperProps {
  markdown: string;
  onMarkdownChange: (value: string) => void;
  showInput: boolean;
  tasks: Task[];
  activeTaskId: string | null;
  onToggleTask: (taskId: string) => void;
  onActivateTask: (taskId: string) => void;
  onLoad: () => void;
  onEdit: () => void;
  onRefresh: () => void;
  onQuickAdd: (title: string) => void;
  loggingIds?: Set<string>;
}

export default function Paper({
  markdown,
  onMarkdownChange,
  showInput,
  tasks,
  activeTaskId,
  onToggleTask,
  onActivateTask,
  onLoad,
  onEdit,
  onRefresh,
  onQuickAdd,
  loggingIds,
}: PaperProps) {
  const [quickAdd, setQuickAdd] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const submitQuickAdd = () => {
    const title = quickAdd.trim();
    if (!title) return;
    onQuickAdd(title);
    setQuickAdd("");
  };

  const handleRefreshClick = () => {
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 450);
  };

  return (
    <>
      <div className="paper-serrated-top" />
      <section
        data-testid="paper"
        className="paper-sheet"
        onDoubleClick={showInput ? undefined : onEdit}
        title="Double-click paper to edit raw Markdown"
      >
        {/* Paper header */}
        <div className="paper-header">
          <div className="paper-title-wrap">
            <span className="pulse-dot" title="Connected to Notion" />
            <span className="paper-title">Daily Plan // Notion</span>
          </div>
          <div className="paper-actions">
            {showInput ? (
              <button type="button" data-testid="key-load" onClick={onLoad} className="paper-btn font-bold">
                DONE (RENDER)
              </button>
            ) : (
              <button type="button" data-testid="key-edit" onClick={onEdit} className="paper-btn">
                EDIT .MD
              </button>
            )}
            <button
              type="button"
              data-testid="key-refresh"
              onClick={handleRefreshClick}
              title="Pull incomplete tasks from Notion"
              className={`paper-btn ${refreshing ? "spin" : ""}`}
            >
              ↻
            </button>
          </div>
        </div>

        {/* Interactive checklist / raw markdown editor */}
        {showInput ? (
          <textarea
            data-testid="paper-input"
            value={markdown}
            onChange={(e) => onMarkdownChange(e.target.value)}
            placeholder={"Paste your Markdown task list here…\n- [ ] Write literature review\n- [ ] Solve 3 LeetCode mediums"}
            className="paper-textarea"
          />
        ) : (
          <ul data-testid="paper-content" className="task-list">
            {tasks.length === 0 ? (
              <li className="empty-paper">
                Paper is clean.
                <br />
                Type below or double-click to paste Markdown.
              </li>
            ) : (
              tasks.map((task) => (
                <li
                  key={task.localId}
                  data-checked={String(task.isChecked)}
                  data-active={String(activeTaskId === task.localId)}
                  className={`task-row ${task.isChecked ? "is-checked" : ""} ${
                    activeTaskId === task.localId ? "is-active" : ""
                  } ${loggingIds?.has(task.localId) ? "is-logging" : ""}`}
                >
                  <button
                    type="button"
                    aria-label={task.isChecked ? "Uncheck task" : "Check task"}
                    onClick={() => onToggleTask(task.localId)}
                    className="retro-checkbox"
                  >
                    {task.isChecked ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => onActivateTask(task.localId)}
                    className="task-text-wrapper font-typewriter"
                  >
                    {activeTaskId === task.localId && (
                      <span className="font-bold" style={{ color: "var(--ribbon-red)", marginRight: 4 }}>
                        ▸
                      </span>
                    )}
                    <span className="task-text">
                      {task.title}
                      <span className="strike-line" />
                    </span>
                  </button>
                  {task.accumulatedMinutes > 0 && (
                    <span className="time-pill">{task.accumulatedMinutes}m</span>
                  )}
                </li>
              ))
            )}
          </ul>
        )}

        {/* Quick-add inline input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuickAdd();
          }}
          className="quick-add"
        >
          <span className="quick-add-plus">+</span>
          <input
            type="text"
            data-testid="paper-quickadd"
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            placeholder="Type task & press Enter…"
            className="quick-add-input"
            style={{ userSelect: "text" }}
          />
        </form>
      </section>
    </>
  );
}
