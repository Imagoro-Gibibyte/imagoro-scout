//! scout-sec-gate: the serving gate in front of an OpenAI-compatible engine.
//!
//! Per request, in order (first failure wins, nothing is forwarded):
//! 1. client key -> client (else **401**)
//! 2. route is one of chat/completions/embeddings (POST) or models (GET) (else 404)
//! 3. body within `max_body_bytes`, valid JSON, has a string `model` (else 404)
//! 4. `model` is on that client's allowlist (else 404)
//! 5. content extracts into known shapes and passes the rules for the client's policy (else 404)
//! 6. forward with the engine's key; stream the response back
//!
//! Every refusal other than auth is the same 404 body, so a client can't map which check fired.
//! The gate logs client, route, model, status and rule ids, never request or response text.

pub mod auth;
pub mod config;
pub mod proxy;
pub mod screen;

use axum::body::to_bytes;
use axum::extract::{Request, State};
use axum::http::{header, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;

pub struct AppState {
    pub loaded: config::Loaded,
    pub rules: Vec<screen::CompiledRule>,
    pub client: proxy::EngineClient,
}

impl AppState {
    pub fn new(loaded: config::Loaded, rules: Vec<screen::CompiledRule>) -> Self {
        Self { loaded, rules, client: proxy::client() }
    }
    fn timeout(&self) -> Duration {
        Duration::from_secs(self.loaded.cfg.limits.timeout_s)
    }
}

pub fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(|| async { json(StatusCode::OK, r#"{"ok":true}"#) }))
        .route("/v1/models", get(models))
        .route("/v1/chat/completions", post(infer))
        .route("/v1/completions", post(infer))
        .route("/v1/embeddings", post(infer))
        // Wrong method on a known route must look like any other unknown route (no 405).
        .method_not_allowed_fallback(fallback)
        .fallback(fallback)
        .with_state(state)
}

fn json(status: StatusCode, body: &'static str) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json")], format!("{body}\n")).into_response()
}
fn unauthorized() -> Response {
    json(StatusCode::UNAUTHORIZED, r#"{"error":{"message":"unauthorized","type":"invalid_request_error"}}"#)
}
fn not_found() -> Response {
    json(StatusCode::NOT_FOUND, r#"{"error":{"message":"not found","type":"invalid_request_error"}}"#)
}
fn bad_gateway() -> Response {
    json(StatusCode::BAD_GATEWAY, r#"{"error":{"message":"engine unavailable","type":"server_error"}}"#)
}

fn norm(m: &str) -> &str {
    m.strip_suffix(":latest").unwrap_or(m)
}

pub fn model_allowed(client: &config::Client, model: &str) -> bool {
    client.models.iter().any(|m| m == "*" || norm(m) == norm(model))
}

fn authenticate<'a>(st: &'a AppState, req: &Request) -> Option<&'a config::Client> {
    auth::find_client(&st.loaded.cfg.clients, auth::presented_key(req.headers()).as_deref())
}

fn log(client: &str, method: &Method, path: &str, model: &str, status: u16, reason: &str) {
    tracing::info!(client, %method, path, model, status, reason, "gate");
}

async fn fallback(State(st): State<Arc<AppState>>, req: Request) -> Response {
    let (m, p) = (req.method().clone(), req.uri().path().to_string());
    match authenticate(&st, &req) {
        None => {
            log("-", &m, &p, "-", 401, "no_or_bad_key");
            unauthorized()
        }
        Some(c) => {
            log(&c.name, &m, &p, "-", 404, "route");
            not_found()
        }
    }
}

async fn models(State(st): State<Arc<AppState>>, req: Request) -> Response {
    let Some(c) = authenticate(&st, &req) else {
        log("-", &Method::GET, "/v1/models", "-", 401, "no_or_bad_key");
        return unauthorized();
    };
    let key = st.loaded.engine_key.as_deref();
    match proxy::fetch(&st.client, &st.loaded.cfg.engine.url, key, "/v1/models", st.timeout(), 1 << 20).await {
        Ok((200, body)) => {
            let Ok(mut v) = serde_json::from_slice::<Value>(&body) else { return bad_gateway() };
            if let Some(data) = v.get_mut("data").and_then(Value::as_array_mut) {
                data.retain(|m| m.get("id").and_then(Value::as_str).is_some_and(|id| model_allowed(c, id)));
            }
            log(&c.name, &Method::GET, "/v1/models", "-", 200, "ok");
            (StatusCode::OK, [(header::CONTENT_TYPE, "application/json")], v.to_string()).into_response()
        }
        Ok((s, _)) => {
            log(&c.name, &Method::GET, "/v1/models", "-", s, "engine_status");
            bad_gateway()
        }
        Err(_) => {
            log(&c.name, &Method::GET, "/v1/models", "-", 502, "engine_unreachable");
            bad_gateway()
        }
    }
}

async fn infer(State(st): State<Arc<AppState>>, req: Request) -> Response {
    let path = req.uri().path().to_string();
    let Some(c) = authenticate(&st, &req).cloned() else {
        log("-", &Method::POST, &path, "-", 401, "no_or_bad_key");
        return unauthorized();
    };
    let refuse = |model: &str, reason: &str| {
        log(&c.name, &Method::POST, &path, model, 404, reason);
        not_found()
    };

    let Ok(body) = to_bytes(req.into_body(), st.loaded.cfg.limits.max_body_bytes).await else {
        return refuse("-", "body_limit");
    };
    let Ok(v) = serde_json::from_slice::<Value>(&body) else { return refuse("-", "bad_json") };
    let Some(model) = v.get("model").and_then(Value::as_str).map(str::to_string) else {
        return refuse("-", "no_model");
    };
    let model_short: String = model.chars().take(80).collect();
    if !model_allowed(&c, &model) {
        return refuse(&model_short, "model_not_allowed");
    }
    let segments = match screen::extract(&path, &v) {
        Ok(s) => s,
        Err(_) => return refuse(&model_short, "content_shape"),
    };
    let verdict = screen::screen(&segments, &st.rules, c.policy);
    for h in &verdict.hits {
        tracing::warn!(client = %c.name, path = %path, rule = %h.rule_id, severity = %h.severity,
                       action = ?h.action, role = %h.role, "screen hit");
    }
    if !verdict.allowed {
        return refuse(&model_short, "screened");
    }

    let key = st.loaded.engine_key.as_deref();
    match proxy::forward(&st.client, &st.loaded.cfg.engine.url, key, Method::POST, &path, body, st.timeout()).await {
        Ok(resp) => {
            log(&c.name, &Method::POST, &path, &model_short, resp.status().as_u16(), "forwarded");
            resp
        }
        Err(_) => {
            log(&c.name, &Method::POST, &path, &model_short, 502, "engine_unreachable");
            bad_gateway()
        }
    }
}

/// Load config + rules (both fail-closed) into a ready state.
pub fn load_state(config_path: &str) -> Result<AppState, String> {
    let loaded = config::load(config_path)?;
    let rules = screen::load_rules(&loaded.cfg.screening.rules_file)?;
    Ok(AppState::new(loaded, rules))
}
