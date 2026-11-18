import { useState } from "react";

interface SettingsModalProps {
  open: boolean;
  apiKey: string;
  databaseId: string;
  onSave: (apiKey: string, databaseId: string) => void;
  onClose: () => void;
}

export default function SettingsModal({
  open,
  apiKey,
  databaseId,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [dbDraft, setDbDraft] = useState(databaseId);

  if (!open) return null;

  return (
    <div
      data-testid="settings-modal"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-[86%] rounded-xl border border-[#c9a959] bg-[#1e2433] p-4 text-[#e2e8f0] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 font-mono text-sm font-bold uppercase tracking-[0.25em] text-[#c9a959]">
          Settings
        </h2>
        <p className="mb-3 font-mono text-[10px] leading-4 text-[#94a3b8]">
          Stored locally in this widget. Notion tokens are sent only to
          api.notion.com via the Tauri backend.
        </p>

        <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-[#c9d1e0]">
          NOTION_API_KEY
          <input
            data-testid="settings-api-key"
            type="password"
            autoComplete="off"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="secret_…"
            className="mt-1 w-full rounded border border-[#3a415a] bg-[#121622] px-2 py-1.5 font-mono text-xs text-[#e2e8f0] outline-none focus:border-[#c9a959]"
          />
        </label>

        <label className="mb-3 block font-mono text-[10px] uppercase tracking-widest text-[#c9d1e0]">
          NOTION_DATABASE_ID
          <input
            data-testid="settings-database-id"
            type="text"
            autoComplete="off"
            value={dbDraft}
            onChange={(e) => setDbDraft(e.target.value)}
            placeholder="32-char database id"
            className="mt-1 w-full rounded border border-[#3a415a] bg-[#121622] px-2 py-1.5 font-mono text-xs text-[#e2e8f0] outline-none focus:border-[#c9a959]"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="settings-cancel"
            onClick={onClose}
            className="rounded border border-[#3a415a] px-3 py-1.5 font-mono text-[11px] text-[#c9d1e0] hover:bg-[#2a3044]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="settings-save"
            onClick={() => onSave(keyDraft.trim(), dbDraft.trim())}
            className="rounded border border-[#c9a959] bg-[#c9a959] px-3 py-1.5 font-mono text-[11px] font-bold text-[#1e2433] hover:bg-[#dbc076]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
