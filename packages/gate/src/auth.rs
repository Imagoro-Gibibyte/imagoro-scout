use axum::http;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedEnvelope {
    pub v: u32,
    pub model_id: String,
    pub box_id: String,
    pub user_id: String,
    pub scope: String,
    pub ts: u64,
    pub nonce: String,
    pub body_sha256: String,
    pub session: Option<String>,
    pub sig: String,
    pub pubkey: String,
}

#[derive(Debug)]
pub struct AuthResult {
    pub ok: bool,
    pub reason: String,
}

pub struct AuthConfig {
    pub allowed_pubkeys: HashSet<String>,
    pub max_age_s: u64,
}

impl AuthConfig {
    pub fn new() -> Self {
        Self {
            allowed_pubkeys: HashSet::new(),
            max_age_s: 30,
        }
    }
}

/// The key a request presents: `Authorization: Bearer <key>`, else `X-Api-Key`.
pub fn presented_key(headers: &http::HeaderMap) -> Option<String> {
    if let Some(v) = headers.get(http::header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if v.len() > 7 && v[..7].eq_ignore_ascii_case("bearer ") {
            let k = v[7..].trim();
            if !k.is_empty() {
                return Some(k.to_string());
            }
        }
    }
    headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Find the client whose stored SHA-256 matches the presented key. Every entry is compared
/// in constant time so timing doesn't reveal which (or whether a) prefix matched.
pub fn find_client<'a>(clients: &'a [crate::config::Client], presented: Option<&str>) -> Option<&'a crate::config::Client> {
    use subtle::ConstantTimeEq;
    let digest = sha256_hex(presented?.as_bytes());
    let mut found = None;
    for c in clients {
        if bool::from(digest.as_bytes().ct_eq(c.sha256.as_bytes())) {
            found = Some(c);
        }
    }
    found
}

pub fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs()
}

pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

pub fn verify_envelope(env: &SignedEnvelope, body: &[u8], cfg: &AuthConfig) -> AuthResult {
    if env.v != 1 {
        return AuthResult { ok: false, reason: "bad_version".to_string() };
    }
    let now = now_ts();
    if now > env.ts + cfg.max_age_s || env.ts > now + 5 {
        return AuthResult { ok: false, reason: "stale_or_future".to_string() };
    }
    let body_hash = sha256_hex(body);
    if body_hash != env.body_sha256 {
        return AuthResult { ok: false, reason: "body_hash_mismatch".to_string() };
    }
    if !cfg.allowed_pubkeys.contains(&env.pubkey) {
        return AuthResult { ok: false, reason: "unknown_pubkey".to_string() };
    }
    let payload = format!("{}|{}|{}|{}|{}|{}|{}|{}|{}", 
        env.v, env.model_id, env.box_id, env.user_id, env.scope, env.ts, env.nonce, env.body_sha256, env.session.as_deref().unwrap_or(""));
    let pubkey_bytes = match hex::decode(&env.pubkey) {
        Ok(b) => b,
        Err(_) => return AuthResult { ok: false, reason: "bad_pubkey_hex".to_string() },
    };
    let sig_bytes = match hex::decode(&env.sig) {
        Ok(b) => b,
        Err(_) => return AuthResult { ok: false, reason: "bad_sig_hex".to_string() },
    };
    if pubkey_bytes.len() != 32 || sig_bytes.len() != 64 {
        return AuthResult { ok: false, reason: "bad_key_sig_len".to_string() };
    }
    let pk_arr: [u8; 32] = match pubkey_bytes.as_slice().try_into() {
        Ok(a) => a,
        Err(_) => return AuthResult { ok: false, reason: "bad_pubkey".to_string() },
    };
    let sig_arr: [u8; 64] = match sig_bytes.as_slice().try_into() {
        Ok(a) => a,
        Err(_) => return AuthResult { ok: false, reason: "bad_sig".to_string() },
    };
    let pk = match VerifyingKey::from_bytes(&pk_arr) {
        Ok(k) => k,
        Err(_) => return AuthResult { ok: false, reason: "bad_pubkey".to_string() },
    };
    let sig = Signature::from_bytes(&sig_arr);
    if pk.verify(payload.as_bytes(), &sig).is_err() {
        return AuthResult { ok: false, reason: "bad_signature".to_string() };
    }
    AuthResult { ok: true, reason: "ok".to_string() }
}
