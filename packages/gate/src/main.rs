use clap::Parser;
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser, Debug)]
#[command(name = "scout-sec-gate", about = "Scout Security Suite serving gate: key auth, model allowlist, content rules, streaming proxy")]
struct Args {
    /// Gate config (TOML); see gate.example.toml
    #[arg(long, default_value = "/etc/scout-sec/gate.toml")]
    config: String,
    /// Validate config and rules, then exit (0 = would start).
    #[arg(long)]
    check: bool,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Args::parse();
    // Fail-closed: bad config, missing key file or unusable rules means no gate.
    let state = match scout_sec_gate::load_state(&args.config) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("refusing to start: {e}");
            std::process::exit(2);
        }
    };
    let bind = state.loaded.cfg.server.bind.clone();
    tracing::info!(
        clients = state.loaded.cfg.clients.len(),
        rules = state.rules.len(),
        engine = %state.loaded.cfg.engine.url,
        engine_key = state.loaded.engine_key.is_some(),
        "config ok"
    );
    if args.check {
        return;
    }

    // The mesh address may not exist yet (VPN still coming up): keep waiting. A gate waiting for
    // its address exposes nothing, and giving up would leave the entry closed until someone
    // notices. The address itself was validated with the config.
    let mut attempt = 0u32;
    let listener = loop {
        match tokio::net::TcpListener::bind(&bind).await {
            Ok(l) => break l,
            Err(e) => {
                if attempt % 120 == 0 {
                    tracing::warn!("waiting to bind {bind}: {e}");
                }
                attempt = attempt.wrapping_add(1);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    };
    tracing::info!("listening on {bind}");
    axum::serve(listener, scout_sec_gate::app(Arc::new(state))).await.expect("server failed");
}
