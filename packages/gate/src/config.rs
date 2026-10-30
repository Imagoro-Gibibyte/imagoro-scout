//! Gate configuration (TOML). Everything is validated up front; any problem refuses to start.
//!
//! ```toml
//! [server]
//! bind = "127.0.0.1:8090"
//!
//! [engine]
//! url = "http://127.0.0.1:8000"          # OpenAI-compatible engine (vLLM, llama.cpp, Ollama /v1)
//! key_file = "/etc/scout-sec/engine.key" # optional: sent as Bearer to the engine
//!
//! [limits]
//! max_body_bytes = 1048576
//! timeout_s = 600
//!
//! [screening]
//! rules_file = "/etc/scout-sec/injection_rules.json"
//!
//! [[clients]]
//! name = "kao-nuc"
//! sha256 = "<sha256 hex of the client's key>"
//! models = ["qwen3-8b-awq"]
//! policy = "strict"                      # strict | evidence
//! ```

use serde::Deserialize;
use std::collections::HashSet;
use std::fs;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Policy {
    /// Untrusted or interactive input: structural and natural-language injection rules.
    Strict,
    /// Security-suite roles whose input is hostile evidence by design: structural rules
    /// only. Content is screened and redacted by the suite's collectors before it gets here.
    Evidence,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Server {
    pub bind: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Engine {
    pub url: String,
    pub key_file: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Limits {
    #[serde(default = "default_max_body")]
    pub max_body_bytes: usize,
    #[serde(default = "default_timeout")]
    pub timeout_s: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self { max_body_bytes: default_max_body(), timeout_s: default_timeout() }
    }
}

fn default_max_body() -> usize {
    1024 * 1024
}
fn default_timeout() -> u64 {
    600
}

#[derive(Debug, Clone, Deserialize)]
pub struct Screening {
    pub rules_file: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Client {
    pub name: String,
    pub sha256: String,
    pub models: Vec<String>,
    pub policy: Policy,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub server: Server,
    pub engine: Engine,
    #[serde(default)]
    pub limits: Limits,
    pub screening: Screening,
    #[serde(default)]
    pub clients: Vec<Client>,
}

/// Validated config plus the secrets it points at.
#[derive(Debug, Clone)]
pub struct Loaded {
    pub cfg: Config,
    pub engine_key: Option<String>,
}

pub fn load(path: &str) -> Result<Loaded, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("config {path}: {e}"))?;
    parse(&text)
}

pub fn parse(text: &str) -> Result<Loaded, String> {
    let cfg: Config = toml::from_str(text).map_err(|e| format!("config parse: {e}"))?;
    validate(&cfg)?;
    let engine_key = match &cfg.engine.key_file {
        Some(p) => {
            let k = fs::read_to_string(p).map_err(|e| format!("engine key_file {p}: {e}"))?;
            let k = k.trim().to_string();
            if k.is_empty() {
                return Err(format!("engine key_file {p} is empty"));
            }
            Some(k)
        }
        None => None,
    };
    Ok(Loaded { cfg, engine_key })
}

fn validate(cfg: &Config) -> Result<(), String> {
    if cfg.server.bind.parse::<std::net::SocketAddr>().is_err() {
        return Err(format!("server.bind {:?} must be ip:port", cfg.server.bind));
    }
    let url = cfg.engine.url.trim_end_matches('/');
    if !url.starts_with("http://") || url.len() <= "http://".len() {
        return Err("engine.url must be http://host:port (the engine is loopback or mesh-local)".into());
    }
    if cfg.limits.max_body_bytes == 0 || cfg.limits.timeout_s == 0 {
        return Err("limits must be positive".into());
    }
    if cfg.clients.is_empty() {
        return Err("no [[clients]]: refusing to start a gate nobody can use".into());
    }
    let mut names = HashSet::new();
    let mut hashes = HashSet::new();
    for c in &cfg.clients {
        if c.name.is_empty() || !names.insert(c.name.as_str()) {
            return Err(format!("client name {:?} empty or duplicated", c.name));
        }
        let h = c.sha256.as_str();
        if h.len() != 64 || !h.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
            return Err(format!("client {}: sha256 must be 64 lowercase hex chars", c.name));
        }
        if !hashes.insert(h) {
            return Err(format!("client {}: key hash shared with another client", c.name));
        }
        if c.models.is_empty() || c.models.iter().any(|m| m.trim().is_empty()) {
            return Err(format!("client {}: models must be a non-empty list", c.name));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const H: &str = "0000000000000000000000000000000000000000000000000000000000000001";

    fn cfg(clients: &str) -> String {
        format!(
            "[server]\nbind = \"127.0.0.1:0\"\n[engine]\nurl = \"http://127.0.0.1:8000\"\n\
             [screening]\nrules_file = \"r.json\"\n{clients}"
        )
    }

    #[test]
    fn valid_config_loads() {
        let c = parse(&cfg(&format!(
            "[[clients]]\nname = \"a\"\nsha256 = \"{H}\"\nmodels = [\"m\"]\npolicy = \"strict\"\n"
        )))
        .unwrap();
        assert_eq!(c.cfg.clients[0].policy, Policy::Strict);
        assert_eq!(c.cfg.limits.max_body_bytes, 1024 * 1024);
    }

    #[test]
    fn refuses_bad_configs() {
        assert!(parse(&cfg("")).is_err(), "no clients");
        assert!(parse(&cfg("[[clients]]\nname = \"a\"\nsha256 = \"abc\"\nmodels = [\"m\"]\npolicy = \"strict\"\n")).is_err());
        assert!(parse(&cfg(&format!("[[clients]]\nname = \"a\"\nsha256 = \"{H}\"\nmodels = []\npolicy = \"strict\"\n"))).is_err());
        assert!(parse(&cfg(&format!("[[clients]]\nname = \"a\"\nsha256 = \"{H}\"\nmodels = [\"m\"]\npolicy = \"open\"\n"))).is_err());
        let dup = format!(
            "[[clients]]\nname = \"a\"\nsha256 = \"{H}\"\nmodels = [\"m\"]\npolicy = \"strict\"\n\
             [[clients]]\nname = \"b\"\nsha256 = \"{H}\"\nmodels = [\"m\"]\npolicy = \"evidence\"\n"
        );
        assert!(parse(&cfg(&dup)).is_err(), "shared key hash");
        let bad_url = cfg(&format!("[[clients]]\nname = \"a\"\nsha256 = \"{H}\"\nmodels = [\"m\"]\npolicy = \"strict\"\n"))
            .replace("http://127.0.0.1:8000", "https://example.com");
        assert!(parse(&bad_url).is_err());
    }

    #[test]
    fn bad_bind_is_an_error() {
        let c = cfg(&format!("[[clients]]
name = \"a\"
sha256 = \"{H}\"
models = [\"m\"]
policy = \"strict\"
"))
            .replace("127.0.0.1:0", "mesh-host:8000");
        assert!(parse(&c).is_err());
    }

    #[test]
    fn missing_engine_key_file_is_an_error() {
        let c = cfg(&format!("[[clients]]\nname = \"a\"\nsha256 = \"{H}\"\nmodels = [\"m\"]\npolicy = \"strict\"\n"))
            .replace("url = \"http://127.0.0.1:8000\"", "url = \"http://127.0.0.1:8000\"\nkey_file = \"/nonexistent/k\"");
        assert!(parse(&c).is_err());
    }
}
