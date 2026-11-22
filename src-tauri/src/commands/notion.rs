use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WireOp {
    Create {
        #[serde(rename = "opIds")]
        op_ids: Vec<String>,
        title: String,
    },
    CreateDone {
        #[serde(rename = "opIds")]
        op_ids: Vec<String>,
        title: String,
        #[serde(rename = "accumulatedMinutes")]
        accumulated_minutes: i64,
    },
    Done {
        #[serde(rename = "opIds")]
        op_ids: Vec<String>,
        #[serde(rename = "notionPageId")]
        notion_page_id: String,
        #[serde(rename = "accumulatedMinutes")]
        accumulated_minutes: i64,
    },
    Rename {
        #[serde(rename = "opIds")]
        op_ids: Vec<String>,
        #[serde(rename = "notionPageId")]
        notion_page_id: String,
        title: String,
    },
    Trash {
        #[serde(rename = "opIds")]
        op_ids: Vec<String>,
        #[serde(rename = "notionPageId")]
        notion_page_id: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub op_ids: Vec<String>,
    pub ok: bool,
    pub error: Option<String>,
    pub page_id: Option<String>,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                reqwest::header::HeaderName::from_static("notion-version"),
                reqwest::header::HeaderValue::from_static("2022-06-28"),
            );
            headers
        })
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

fn title_prop(title: &str) -> serde_json::Value {
    serde_json::json!({ "title": [{ "text": { "content": title } }] })
}

fn done_properties(title: &str, accumulated_minutes: i64, now: &str) -> serde_json::Value {
    serde_json::json!({
        "Task": { "title": [{ "text": { "content": title } }] },
        "Status": { "status": { "name": "Done" } },
        "Time (Min)": { "number": accumulated_minutes },
        "Logged At": { "date": { "start": now } }
    })
}

fn patch_body(properties: serde_json::Value) -> serde_json::Value {
    serde_json::json!({ "properties": properties })
}

async fn send_patch(
    client: &reqwest::Client,
    url: &str,
    body: serde_json::Value,
    api_key: &str,
) -> Result<reqwest::Response, String> {
    client
        .patch(url)
        .json(&body)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|e| format!("Notion PATCH error: {}", e))
}

async fn send_post(
    client: &reqwest::Client,
    url: &str,
    body: serde_json::Value,
    api_key: &str,
) -> Result<reqwest::Response, String> {
    client
        .post(url)
        .json(&body)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|e| format!("Notion POST error: {}", e))
}

#[tauri::command]
pub async fn notion_flush_ops(
    ops: Vec<WireOp>,
    api_key: String,
    database_id: String,
) -> Result<Vec<OpResult>, String> {
    let client = build_client();
    let mut results: Vec<OpResult> = Vec::with_capacity(ops.len());

    for op in ops {
        let (op_ids, outcome): (Vec<String>, Result<Option<String>, String>) = match &op {
            WireOp::Create {
                op_ids,
                title,
                ..
            } => {
                let body = serde_json::json!({
                    "parent": { "database_id": database_id },
                    "properties": { "Task": title_prop(title) }
                });
                let outcome = match send_post(&client, "https://api.notion.com/v1/pages", body, &api_key).await {
                    Ok(resp) if resp.status().is_success() => {
                        match resp.json::<serde_json::Value>().await {
                            Ok(json) => Ok(json.get("id").and_then(|v| v.as_str()).map(String::from)),
                            Err(e) => Err(format!("Notion response parse error: {}", e)),
                        }
                    }
                    Ok(resp) => Err(response_error(resp).await),
                    Err(e) => Err(e),
                };
                (op_ids.clone(), outcome)
            }
            WireOp::CreateDone {
                op_ids,
                title,
                accumulated_minutes,
                ..
            } => {
                let now = now_iso();
                let body = serde_json::json!({
                    "parent": { "database_id": database_id },
                    "properties": done_properties(title, *accumulated_minutes, &now)
                });
                let outcome = match send_post(&client, "https://api.notion.com/v1/pages", body, &api_key).await {
                    Ok(resp) if resp.status().is_success() => {
                        match resp.json::<serde_json::Value>().await {
                            Ok(json) => Ok(json.get("id").and_then(|v| v.as_str()).map(String::from)),
                            Err(e) => Err(format!("Notion response parse error: {}", e)),
                        }
                    }
                    Ok(resp) => Err(response_error(resp).await),
                    Err(e) => Err(e),
                };
                (op_ids.clone(), outcome)
            }
            WireOp::Done {
                op_ids,
                notion_page_id,
                accumulated_minutes,
                ..
            } => {
                let now = now_iso();
                let properties = serde_json::json!({
                    "Status": { "status": { "name": "Done" } },
                    "Time (Min)": { "number": accumulated_minutes },
                    "Logged At": { "date": { "start": now } }
                });
                let url = format!("https://api.notion.com/v1/pages/{}", notion_page_id);
                let outcome = match send_patch(&client, &url, patch_body(properties), &api_key).await {
                    Ok(resp) if resp.status().is_success() => Ok(None),
                    Ok(resp) => Err(response_error(resp).await),
                    Err(e) => Err(e),
                };
                (op_ids.clone(), outcome)
            }
            WireOp::Rename {
                op_ids,
                notion_page_id,
                title,
            } => {
                let properties = serde_json::json!({ "Task": title_prop(title) });
                let url = format!("https://api.notion.com/v1/pages/{}", notion_page_id);
                let outcome = match send_patch(&client, &url, patch_body(properties), &api_key).await {
                    Ok(resp) if resp.status().is_success() => Ok(None),
                    Ok(resp) => Err(response_error(resp).await),
                    Err(e) => Err(e),
                };
                (op_ids.clone(), outcome)
            }
            WireOp::Trash {
                op_ids,
                notion_page_id,
            } => {
                let url = format!("https://api.notion.com/v1/pages/{}", notion_page_id);
                let outcome = match send_patch(&client, &url, serde_json::json!({ "archived": true }), &api_key).await {
                    Ok(resp) if resp.status().is_success() => Ok(None),
                    Ok(resp) => Err(response_error(resp).await),
                    Err(e) => Err(e),
                };
                (op_ids.clone(), outcome)
            }
        };

        results.push(OpResult {
            op_ids,
            ok: outcome.is_ok(),
            error: outcome.as_ref().err().cloned(),
            page_id: outcome.unwrap_or(None),
        });
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
