use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionTaskPayload {
    pub task_id: String,
    pub notion_page_id: Option<String>,
    pub title: String,
    pub is_checked: bool,
    pub accumulated_minutes: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionSyncResult {
    pub task_id: String,
    pub ok: bool,
    pub error: Option<String>,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[tauri::command]
pub async fn notion_log_batch(
    _app: AppHandle,
    tasks: Vec<NotionTaskPayload>,
    api_key: String,
    database_id: String,
) -> Result<Vec<NotionSyncResult>, String> {
    let client = reqwest::Client::new();
    let mut results: Vec<NotionSyncResult> = Vec::new();

    for task in tasks {
        let result = if let Some(page_id) = task.notion_page_id.clone() {
            let url = format!("https://api.notion.com/v1/pages/{}", page_id);
            let body = serde_json::json!({
                "properties": {
                    "Task": { "title": [{ "text": { "content": task.title } }] },
                    "Status": { "status": { "name": "Done" } },
                    "Time (Min)": { "number": task.accumulated_minutes },
                    "Logged At": { "date": { "start": now_iso() } }
                }
            });
            let response = client
                .patch(&url)
                .json(&body)
                .bearer_auth(&api_key)
                .send()
                .await;
            match response {
                Ok(resp) if resp.status().is_success() => NotionSyncResult {
                    task_id: task.task_id.clone(),
                    ok: true,
                    error: None,
                },
                Ok(resp) => NotionSyncResult {
                    task_id: task.task_id.clone(),
                    ok: false,
                    error: Some(format!("Notion PATCH failed: {}", resp.status())),
                },
                Err(e) => NotionSyncResult {
                    task_id: task.task_id.clone(),
                    ok: false,
                    error: Some(format!("Notion PATCH error: {}", e)),
                },
            }
        } else {
            let url = "https://api.notion.com/v1/pages".to_string();
            let body = serde_json::json!({
                "parent": { "database_id": database_id },
                "properties": {
                    "Task": { "title": [{ "text": { "content": task.title } }] },
                    "Status": { "status": { "name": "Done" } },
                    "Time (Min)": { "number": task.accumulated_minutes },
                    "Logged At": { "date": { "start": now_iso() } }
                }
            });
            let response = client.post(&url).json(&body).bearer_auth(&api_key).send().await;
            match response {
                Ok(resp) if resp.status().is_success() => NotionSyncResult {
                    task_id: task.task_id.clone(),
                    ok: true,
                    error: None,
                },
                Ok(resp) => NotionSyncResult {
                    task_id: task.task_id.clone(),
                    ok: false,
                    error: Some(format!("Notion POST failed: {}", resp.status())),
                },
                Err(e) => NotionSyncResult {
                    task_id: task.task_id.clone(),
                    ok: false,
                    error: Some(format!("Notion POST error: {}", e)),
                },
            }
        };

        results.push(result);
    }

    Ok(results)
}
