/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full ws(s):// URL of a pty agent, e.g. wss://term.example/ws. */
  readonly VITE_AGENT_URL?: string;
  /**
   * ws(s):// URL of the gateway. When set, the UI talks only to the gateway
   * (authenticated, no client secrets).
   */
  readonly VITE_GATEWAY_URL?: string;
  /** Optional bearer token passed to the agent as ?token= (direct mode only). */
  readonly VITE_AGENT_TOKEN?: string;
  /** Public repository URL, used for the source and issue links. */
  readonly VITE_REPO_URL?: string;
  /** Address for privacy requests, shown on /privacy and /terms. Without it, they point at /contact. */
  readonly VITE_PRIVACY_CONTACT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_ID__: string;
