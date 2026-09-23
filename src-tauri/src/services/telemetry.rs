use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

const SOURCE_ID: &str = "sourccey-desktop";
const DEFAULT_GATEWAY_URL: &str = "https://gateway.plexus.company/ingest";
const QUEUE_CAPACITY: usize = 512;
const BATCH_CAPACITY: usize = 32;

static SENDER: OnceLock<Option<mpsc::Sender<Point>>> = OnceLock::new();
static CONTROL_SESSIONS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
struct Point {
    metric: String,
    value: Value,
    #[serde(rename = "class", skip_serializing_if = "Option::is_none")]
    point_class: Option<&'static str>,
}

#[derive(Serialize)]
struct IngestRequest {
    source_id: &'static str,
    points: Vec<Point>,
}

pub fn init() {
    let _ = sender();
}

pub fn metric(name: &str, value: f64) {
    enqueue(Point {
        metric: name.to_string(),
        value: json!(value),
        point_class: None,
    });
}

pub fn event(name: &str, value: Value) {
    enqueue(Point {
        metric: name.to_string(),
        value,
        point_class: Some("event"),
    });
}

pub fn control_started(mode: &str, local_session_key: &str) {
    let key = format!("{mode}:{local_session_key}");
    if let Ok(mut sessions) = control_sessions().lock() {
        sessions.insert(key, Instant::now());
    }
    event(
        "control.session",
        json!({ "mode": mode, "state": "started" }),
    );
}

pub fn control_start_failed(mode: &str) {
    event(
        "control.session",
        json!({
            "mode": mode,
            "state": "failed",
            "phase": "start"
        }),
    );
}

pub fn control_ready(mode: &str) {
    event("control.session", json!({ "mode": mode, "state": "ready" }));
}

pub fn control_finished(mode: &str, local_session_key: &str, outcome: &str) {
    let key = format!("{mode}:{local_session_key}");
    let duration_ms = control_sessions()
        .lock()
        .ok()
        .and_then(|mut sessions| sessions.remove(&key))
        .map(|started| started.elapsed().as_secs_f64() * 1000.0);

    if let Some(duration_ms) = duration_ms {
        metric("control.session.duration_ms", duration_ms);
    }
    event(
        "control.session",
        json!({
            "mode": mode,
            "state": "finished",
            "outcome": outcome,
            "duration_ms": duration_ms
        }),
    );
}

fn control_sessions() -> &'static Mutex<HashMap<String, Instant>> {
    CONTROL_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn enqueue(point: Point) {
    if let Some(tx) = sender() {
        // A full/disconnected queue intentionally drops telemetry. Application work wins.
        let _ = tx.try_send(point);
    }
}

fn sender() -> &'static Option<mpsc::Sender<Point>> {
    SENDER.get_or_init(|| {
        let api_key = std::env::var("PLEXUS_API_KEY")
            .ok()
            .filter(|value| !value.trim().is_empty())?;
        let gateway_url =
            std::env::var("PLEXUS_GATEWAY_URL").unwrap_or_else(|_| DEFAULT_GATEWAY_URL.to_string());
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(4))
            .build()
            .ok()?;
        let (tx, rx) = mpsc::channel(QUEUE_CAPACITY);
        tauri::async_runtime::spawn(run_worker(rx, client, api_key, gateway_url));
        Some(tx)
    })
}

async fn run_worker(
    mut rx: mpsc::Receiver<Point>,
    client: reqwest::Client,
    api_key: String,
    gateway_url: String,
) {
    while let Some(first) = rx.recv().await {
        let mut points = Vec::with_capacity(BATCH_CAPACITY);
        points.push(first);
        let deadline = tokio::time::Instant::now() + Duration::from_millis(100);

        while points.len() < BATCH_CAPACITY {
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Ok(Some(point)) => points.push(point),
                _ => break,
            }
        }

        let request = IngestRequest {
            source_id: SOURCE_ID,
            points,
        };
        // Delivery is best-effort by design: never retry on or report into the hot path.
        let _ = client
            .post(&gateway_url)
            .header("x-api-key", &api_key)
            .json(&request)
            .send()
            .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_serializes_with_event_class() {
        let point = Point {
            metric: "app.lifecycle".to_string(),
            value: json!({ "state": "started" }),
            point_class: Some("event"),
        };
        let value = serde_json::to_value(point).unwrap();
        assert_eq!(value["class"], "event");
        assert_eq!(value["metric"], "app.lifecycle");
    }
}
