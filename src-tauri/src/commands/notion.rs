use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionTaskPayload {
    pub task_id: String,
    pub notion_page_id: Option<String>,
    pub title: String,
    pub is_checked: bool,
    pub accumulated_minutes: i64,
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

fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .expect("reqwest client must build")
}

async fn response_error(resp: reqwest::Response) -> String {
    let status = resp.status();
    match resp.text().await {
        Ok(body) => format!("Notion responded {}: {}", status, body),
        Err(_) => format!("Notion responded {}", status),
    }
}

#[tauri::command]
pub async fn notion_log_batch(
    tasks: Vec<NotionTaskPayload>,
    api_key: String,
    database_id: String,
) -> Result<Vec<NotionSyncResult>, String> {
    let client = build_client();
    let mut results: Vec<NotionSyncResult> = Vec::with_capacity(tasks.len());

    for task in tasks {
        let body = serde_json::json!({
            "properties": {
                "Task": { "title": [{ "text": { "content": task.title } }] },
                "Status": { "status": { "name": "Done" } },
                "Time (Min)": { "number": task.accumulated_minutes },
                "Logged At": { "date": { "start": now_iso() } }
            }
        });

        let result = match &task.notion_page_id {
            Some(page_id) => {
                let url = format!("https://api.notion.com/v1/pages/{}", page_id);
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
                        error: Some(response_error(resp).await),
                    },
                    Err(e) => NotionSyncResult {
                        task_id: task.task_id.clone(),
                        ok: false,
                        error: Some(format!("Notion PATCH error: {}", e)),
                    },
                }
            }
            None => {
                let create_body = serde_json::json!({
                    "parent": { "database_id": database_id },
                    "properties": body["properties"].clone(),
                });
                let url = "https://api.notion.com/v1/pages".to_string();
                let response = client
                    .post(&url)
                    .json(&create_body)
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
                        error: Some(response_error(resp).await),
                    },
                    Err(e) => NotionSyncResult {
                        task_id: task.task_id.clone(),
                        ok: false,
                        error: Some(format!("Notion POST error: {}", e)),
                    },
                }
            }
        };

        results.push(result);
    }

    Ok(results)
}

#[tauri::command]
pub async fn notion_query_incomplete(
    api_key: String,
    database_id: String,
) -> Result<serde_json::Value, String> {
    let client = build_client();
    let url = format!("https://api.notion.com/v1/databases/{}/query", database_id);
    let body = serde_json::json!({
        "filter": {
            "property": "Status",
            "status": { "does_not_equal": "Done" }
        },
        "page_size": 100
    });

    let response = client
        .post(&url)
        .json(&body)
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|e| format!("Notion query error: {}", e))?;

    if !response.status().is_success() {
        return Err(response_error(response).await);
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Notion response parse error: {}", e))
}
