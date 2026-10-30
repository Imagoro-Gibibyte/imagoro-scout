//! Forwarding to the engine. A fresh request is built for every call: nothing from the
//! client's headers reaches the engine except the body; the engine gets its own key.
//! Responses stream through (SSE for `stream: true`), so the timeout covers the engine's
//! response headers, not the whole generation.

use axum::body::Body;
use axum::http::{header, Method, Request, Response};
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper_util::client::legacy::{connect::HttpConnector, Client};
use hyper_util::rt::TokioExecutor;
use std::time::Duration;

pub type EngineClient = Client<HttpConnector, Full<Bytes>>;

pub fn client() -> EngineClient {
    Client::builder(TokioExecutor::new()).build_http()
}

fn build(base: &str, key: Option<&str>, method: Method, path: &str, body: Bytes) -> Result<Request<Full<Bytes>>, String> {
    let mut b = Request::builder()
        .method(method)
        .uri(format!("{}{}", base.trim_end_matches('/'), path))
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(k) = key {
        b = b.header(header::AUTHORIZATION, format!("Bearer {k}"));
    }
    b.body(Full::new(body)).map_err(|e| e.to_string())
}

/// Forward and stream the engine's response back unchanged (status, content type, body).
pub async fn forward(
    client: &EngineClient,
    base: &str,
    key: Option<&str>,
    method: Method,
    path: &str,
    body: Bytes,
    timeout: Duration,
) -> Result<Response<Body>, String> {
    let req = build(base, key, method, path, body)?;
    let resp = tokio::time::timeout(timeout, client.request(req))
        .await
        .map_err(|_| "engine timeout".to_string())?
        .map_err(|e| format!("engine unreachable: {e}"))?;
    let (parts, incoming) = resp.into_parts();
    let mut out = Response::builder().status(parts.status);
    if let Some(ct) = parts.headers.get(header::CONTENT_TYPE) {
        out = out.header(header::CONTENT_TYPE, ct);
    }
    out.body(Body::new(incoming)).map_err(|e| e.to_string())
}

/// Forward and collect a small response (used for `/v1/models`, which the gate filters).
pub async fn fetch(
    client: &EngineClient,
    base: &str,
    key: Option<&str>,
    path: &str,
    timeout: Duration,
    max_bytes: usize,
) -> Result<(u16, Bytes), String> {
    let req = build(base, key, Method::GET, path, Bytes::new())?;
    let resp = tokio::time::timeout(timeout, client.request(req))
        .await
        .map_err(|_| "engine timeout".to_string())?
        .map_err(|e| format!("engine unreachable: {e}"))?;
    let status = resp.status().as_u16();
    let body = Limited::new(resp.into_body(), max_bytes)
        .collect()
        .await
        .map_err(|e| format!("engine body: {e}"))?
        .to_bytes();
    Ok((status, body))
}
