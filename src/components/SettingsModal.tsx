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
    <div data-testid="settings-modal" className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="settings-title">Notion Integration</h2>
        <p className="settings-note">
          Credentials are stored only in this widget and are sent exclusively to
          api.notion.com through the Tauri backend — never to the webview directly.
        </p>

        <label className="settings-label">
          NOTION_API_KEY
          <input
            data-testid="settings-api-key"
            type="password"
            autoComplete="off"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="secret_…"
            className="settings-input"
          />
        </label>

        <label className="settings-label">
          NOTION_DATABASE_ID
          <input
            data-testid="settings-database-id"
            type="text"
            autoComplete="off"
            value={dbDraft}
            onChange={(e) => setDbDraft(e.target.value)}
            placeholder="32-char database id"
            className="settings-input"
          />
        </label>

        <div className="settings-actions">
          <button type="button" data-testid="settings-cancel" onClick={onClose} className="ribbon-btn">
            CANCEL
          </button>
          <button
            type="button"
            data-testid="settings-save"
            onClick={() => onSave(keyDraft.trim(), dbDraft.trim())}
            className="ribbon-btn primary"
          >
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}
