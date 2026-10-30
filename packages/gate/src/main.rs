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

    let listener = match tokio::net::TcpListener::bind(&bind).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("bind {bind}: {e}");
            std::process::exit(2);
        }
    };
    tracing::info!("listening on {bind}");
    axum::serve(listener, scout_sec_gate::app(Arc::new(state))).await.expect("server failed");
}
