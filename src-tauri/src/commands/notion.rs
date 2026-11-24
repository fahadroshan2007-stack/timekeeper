use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;

const NOTION_PAGE_SIZE: usize = 100;
const MAX_NOTION_QUERY_PAGES: usize = 100;

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

fn initial_query_body() -> Value {
    serde_json::json!({
        "filter": {
            "property": "Status",
            "status": { "does_not_equal": "Done" }
        },
        "page_size": NOTION_PAGE_SIZE
    })
}

fn next_query_body(next_cursor: &str) -> Value {
    serde_json::json!({
        "filter": {
            "property": "Status",
            "status": { "does_not_equal": "Done" }
        },
        "page_size": NOTION_PAGE_SIZE,
        "start_cursor": next_cursor
    })
}

fn should_fetch_next(has_more: bool, next_cursor: Option<&str>) -> bool {
    has_more && next_cursor.is_some_and(|cursor| !cursor.trim().is_empty())
}

fn merge_query_pages(pages: Vec<Value>) -> Value {
    let mut results: Vec<Value> = Vec::new();
    let mut seen_page_ids: HashSet<String> = HashSet::new();
    let mut request_id = Value::Null;

    for (index, page) in pages.into_iter().enumerate() {
        if index == 0 {
            request_id = page.get("request_id").cloned().unwrap_or(Value::Null);
        }

        let page_results = page.get("results").and_then(Value::as_array);
        if let Some(page_results) = page_results {
            if !page_results.is_empty() {
                for page_object in page_results {
                    let page_id = page_object
                        .get("id")
                        .and_then(Value::as_str)
                        .map(String::from);
                    let is_duplicate = match &page_id {
                        Some(page_id) => !seen_page_ids.insert(page_id.clone()),
                        None => false,
                    };
                    if is_duplicate {
                        continue;
                    }
                    results.push(page_object.clone());
                }
            }
        }
    }

    serde_json::json!({
        "results": Value::Array(results),
        "has_more": false,
        "next_cursor": Value::Null,
        "request_id": request_id,
    })
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
) -> Result<Value, String> {
    let client = build_client();
    let url = format!("https://api.notion.com/v1/databases/{}/query", database_id);

    let mut pages: Vec<Value> = Vec::new();
    let mut next_cursor: Option<String> = None;
    let mut fetched_pages = 0usize;

    loop {
        let body = match &next_cursor {
            Some(cursor) => next_query_body(cursor),
            None => initial_query_body(),
        };

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

        let page = response
            .json::<Value>()
            .await
            .map_err(|e| format!("Notion response parse error: {}", e))?;

        pages.push(page.clone());
        fetched_pages += 1;

        if fetched_pages > MAX_NOTION_QUERY_PAGES {
            return Err(format!(
                "Notion query exceeded maximum of {} pages without finishing",
                MAX_NOTION_QUERY_PAGES
            ));
        }

        let has_more = page
            .get("has_more")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let cursor = page
            .get("next_cursor")
            .and_then(Value::as_str)
            .map(|cursor| cursor.to_string());

        if !should_fetch_next(has_more, cursor.as_deref()) {
            break;
        }

        next_cursor = cursor;
    }

    Ok(merge_query_pages(pages))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_query_body_filters_out_done_tasks_and_pages() {
        let body = initial_query_body();

        assert_eq!(body["filter"]["property"].as_str().unwrap(), "Status");
        assert_eq!(
            body["filter"]["status"]["does_not_equal"].as_str().unwrap(),
            "Done"
        );
        assert_eq!(body["page_size"].as_i64().unwrap(), NOTION_PAGE_SIZE as i64);
    }

    #[test]
    fn next_query_body_reuses_filter_and_sets_start_cursor() {
        let body = next_query_body("cursor-abc");

        assert_eq!(body["start_cursor"].as_str().unwrap(), "cursor-abc");
        assert_eq!(body["filter"]["property"].as_str().unwrap(), "Status");
        assert_eq!(
            body["filter"]["status"]["does_not_equal"].as_str().unwrap(),
            "Done"
        );
        assert_eq!(body["page_size"].as_i64().unwrap(), NOTION_PAGE_SIZE as i64);
    }

    #[test]
    fn should_fetch_next_requires_has_more_and_a_cursor() {
        assert!(should_fetch_next(true, Some("cursor-abc")));
        assert!(!should_fetch_next(false, Some("cursor-abc")));
        assert!(!should_fetch_next(true, None));
        assert!(!should_fetch_next(true, Some("  ")));
    }

    #[test]
    fn merge_query_pages_combines_results_dedupes_and_closes_pagination() {
        let first_page = serde_json::json!({
            "results": [
                { "id": "page-1", "properties": { "Task": { "title": [{ "plain_text": "Buy milk" }] } } }
            ],
            "has_more": true,
            "next_cursor": "cursor-abc",
            "request_id": "request-1",
        });
        let second_page = serde_json::json!({
            "results": [
                { "id": "page-2", "properties": { "Task": { "title": [{ "plain_text": "Walk dog" }] } } },
                { "id": "page-1", "properties": { "Task": { "title": [{ "plain_text": "Buy milk" }] } } },
            ],
            "has_more": true,
            "next_cursor": "cursor-def",
            "request_id": "request-2",
        });

        let merged = merge_query_pages(vec![first_page, second_page]);

        let results = merged["results"].as_array().unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["id"].as_str().unwrap(), "page-1");
        assert_eq!(results[1]["id"].as_str().unwrap(), "page-2");
        assert_eq!(merged["has_more"].as_bool().unwrap(), false);
        assert!(merged["next_cursor"].is_null());
    }

    #[test]
    fn merge_query_pages_preserves_first_request_id_and_closed_metadata() {
        let first_page = serde_json::json!({
            "results": [
                { "id": "page-1", "properties": { "Task": { "title": [{ "plain_text": "Buy milk" }] } } }
            ],
            "has_more": true,
            "next_cursor": "cursor-abc",
            "request_id": "request-1",
        });
        let second_page = serde_json::json!({
            "results": [
                { "id": "page-2", "properties": { "Task": { "title": [{ "plain_text": "Walk dog" }] } } }
            ],
            "has_more": true,
            "next_cursor": "cursor-def",
            "request_id": "request-2",
        });

        let merged = merge_query_pages(vec![first_page, second_page]);

        assert_eq!(merged["request_id"].as_str().unwrap(), "request-1");
        assert_eq!(merged["has_more"].as_bool().unwrap(), false);
        assert!(merged["next_cursor"].is_null());
    }

    #[test]
    fn merge_query_pages_handles_missing_or_empty_results_arrays() {
        let empty_results_page = serde_json::json!({
            "results": [],
            "has_more": false,
            "next_cursor": null,
            "request_id": "request-3",
        });
        let missing_results_page = serde_json::json!({
            "has_more": false,
            "next_cursor": null,
            "request_id": "request-4",
        });

        let merged = merge_query_pages(vec![empty_results_page, missing_results_page]);

        let results = merged["results"].as_array().unwrap();
        assert_eq!(results.len(), 0);
        assert_eq!(merged["request_id"].as_str().unwrap(), "request-3");
        assert_eq!(merged["has_more"].as_bool().unwrap(), false);
        assert!(merged["next_cursor"].is_null());
    }
}
