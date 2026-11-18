import type { Task } from "../lib/tasks";

interface PaperProps {
  markdown: string;
  onMarkdownChange: (value: string) => void;
  showInput: boolean;
  tasks: Task[];
  activeTaskId: string | null;
  onToggleTask: (taskId: string) => void;
  onActivateTask: (taskId: string) => void;
  onEdit: () => void;
  onLoad: () => void;
  onRefresh: () => void;
}

export default function Paper({
  markdown,
  onMarkdownChange,
  showInput,
  tasks,
  activeTaskId,
  onToggleTask,
  onActivateTask,
  onEdit,
  onLoad,
  onRefresh,
}: PaperProps) {
  const activeCount = tasks.filter((t) => t.isChecked).length;

  return (
    <section
      data-testid="paper"
      className="relative min-h-0 flex-[1.4] overflow-hidden rounded-t-2xl bg-[#FDF6E3] px-4 py-3 shadow-2xl"
    >
      <div
        data-testid="paper-content"
        className="absolute inset-0 overflow-y-auto rounded-t-2xl px-4 py-3"
      >
        <div className="mb-2 flex items-center justify-between border-b-2 border-[#d8c9a8] pb-1">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8a7a5c]">
            To Do
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="key-refresh"
              onClick={onRefresh}
              title="Refresh tasks from Notion"
              className="rounded border border-[#d8c9a8] bg-[#f5edd8] px-1.5 py-0.5 font-mono text-[10px] text-[#5c4d33] hover:bg-[#efe3c6]"
            >
              ↻
            </button>
            {showInput ? (
              <button
                type="button"
                data-testid="key-load"
                onClick={onLoad}
                className="rounded border border-[#d8c9a8] bg-[#f5edd8] px-1.5 py-0.5 font-mono text-[10px] text-[#5c4d33] hover:bg-[#efe3c6]"
              >
                LOAD →
              </button>
            ) : (
              <button
                type="button"
                data-testid="key-edit"
                onClick={onEdit}
                className="rounded border border-[#d8c9a8] bg-[#f5edd8] px-1.5 py-0.5 font-mono text-[10px] text-[#5c4d33] hover:bg-[#efe3c6]"
              >
                EDIT ✎
              </button>
            )}
          </div>
        </div>

        {showInput ? (
          <textarea
            data-testid="paper-input"
            value={markdown}
            onChange={(e) => onMarkdownChange(e.target.value)}
            placeholder="Paste your Markdown task list here…&#10;- [ ] First task&#10;- [ ] Second task"
            className="h-full min-h-0 w-full resize-none border-none bg-transparent font-mono text-[13px] leading-6 text-[#3a3026] outline-none placeholder:text-[#c2b291]"
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.length === 0 && (
              <li className="font-mono text-[12px] italic text-[#b3a482]">
                Nothing here yet. Click EDIT ✎ to paste a Markdown task list.
              </li>
            )}
            {tasks.map((task) => (
              <li
                key={task.localId}
                data-checked={String(task.isChecked)}
                data-active={String(activeTaskId === task.localId)}
                className="group flex items-start gap-2 rounded-md px-1 py-1"
              >
                <button
                  type="button"
                  aria-label={task.isChecked ? "Uncheck task" : "Check task"}
                  onClick={() => onToggleTask(task.localId)}
                  className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center border-2 text-[10px] transition-colors ${
                    task.isChecked
                      ? "border-[#222] bg-[#222] text-[#f5c518]"
                      : "border-[#8a7a5c] bg-white text-transparent hover:border-[#222]"
                  }`}
                >
                  {task.isChecked ? "✓" : "·"}
                </button>
                <button
                  type="button"
                  onClick={() => onActivateTask(task.localId)}
                  className={`min-w-0 flex-1 text-left font-mono text-[13px] leading-6 transition-colors ${
                    task.isChecked ? "strike-anim text-[#a99c7c]" : "text-[#3a3026]"
                  } ${
                    activeTaskId === task.localId
                      ? "border-b-2 border-red-500 underline decoration-red-500 underline-offset-4"
                      : "border-b-2 border-transparent"
                  }`}
                >
                  {task.title}
                </button>
                {task.accumulatedMinutes > 0 && (
                  <span className="mt-0.5 flex-none rounded-full bg-[#f5c518] px-2 py-0.5 font-mono text-[10px] font-bold text-[#222] shadow-sm">
                    {task.accumulatedMinutes}m
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {!showInput && activeCount > 0 && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-[#8a7a5c]">
            {activeCount} checked — press LOG on the chassis to sync
          </p>
        )}
      </div>
    </section>
  );
}
