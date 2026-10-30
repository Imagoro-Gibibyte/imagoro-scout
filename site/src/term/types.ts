export type SessionKind = "demo" | "agent";

export interface Session {
  id: string;
  title: string;
  kind: SessionKind;
  /** Shell id for agent sessions, e.g. "powershell.exe", "bash". */
  shell?: string;
  /** Gateway host id for agent sessions (empty = gateway default host). */
  host?: string;
}

export interface AgentInfo {
  ok: boolean;
  platform: string;
  shell: string;
  shells: string[];
  version: string;
}

/** One pty agent as reported by the gateway's `/api/hosts`. */
export interface HostInfo {
  id: string;
  label: string;
  online: boolean;
  platform?: string;
  shells?: string[];
  error?: string;
}
