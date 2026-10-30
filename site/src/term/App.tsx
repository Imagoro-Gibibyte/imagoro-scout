import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TabBar } from "./TabBar";
import { TerminalView } from "./Terminal";
import {
  agentTokenFromEnv,
  agentUrlFromEnv,
  fetchAgentInfo,
  fetchGatewayHosts,
  gatewayUrlFromEnv
} from "./agentClient";
import type { AgentInfo, HostInfo, Session } from "./types";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Math.random().toString(36).slice(2)}`;
}

/**
 * The terminal, mounted at `/term` inside the site shell. It opens a demo shell
 * by default; a tab can target a real pty agent when the build was given
 * `VITE_AGENT_URL` (direct) or `VITE_GATEWAY_URL` (gateway, Access-authenticated).
 */
export function TerminalPage() {
  const [sessions, setSessions] = useState<Session[]>(() => [{ id: newId(), title: "demo", kind: "demo" }]);
  const [activeId, setActiveId] = useState<string>(() => sessions[0]!.id);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const counter = useRef(1);

  const agentUrl = useMemo(() => agentUrlFromEnv(), []);
  const gatewayUrl = useMemo(() => gatewayUrlFromEnv(), []);
  const onlineHosts = hosts.filter((h) => h.online);
  const online = gatewayUrl ? onlineHosts.length > 0 : !!agentInfo;

  useEffect(() => {
    let cancelled = false;
    if (gatewayUrl) {
      fetchGatewayHosts(gatewayUrl).then((list) => {
        if (!cancelled) setHosts(list);
      });
    } else {
      fetchAgentInfo(agentUrl, agentTokenFromEnv()).then((info) => {
        if (!cancelled) setAgentInfo(info);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, agentUrl]);

  const addSession = useCallback((kind: Session["kind"], shell?: string, host?: string) => {
    const id = newId();
    const title = kind === "demo" ? `demo ${++counter.current}` : shell ?? "agent";
    setSessions((prev) => [...prev, { id, title, kind, shell, host }]);
    setActiveId(id);
    setMenuOpen(false);
  }, []);

  const pickNeighbor = (list: Session[], removedIdx: number): string => list[Math.max(0, removedIdx - 1)]!.id;

  const closeSession = useCallback(
    (id: string) => {
      if (sessions.length <= 1) return;
      const idx = sessions.findIndex((s) => s.id === id);
      const next = sessions.filter((s) => s.id !== id);
      setSessions(next);
      if (activeId === id) setActiveId(pickNeighbor(next, idx));
    },
    [sessions, activeId]
  );

  // Exit never leaves the terminal empty: the last tab is replaced by a fresh demo.
  const exitSession = useCallback(
    (id: string) => {
      if (sessions.length <= 1) {
        const fresh: Session = { id: newId(), title: "demo", kind: "demo" };
        setSessions([fresh]);
        setActiveId(fresh.id);
        return;
      }
      const idx = sessions.findIndex((s) => s.id === id);
      const next = sessions.filter((s) => s.id !== id);
      setSessions(next);
      if (activeId === id) setActiveId(pickNeighbor(next, idx));
    },
    [sessions, activeId]
  );

  return (
    <div className="term-app">
      <div className="term-topbar">
        <div className="term-brand">
          <span className="term-brand-mark" aria-hidden="true">
            ▚
          </span>
          <span>Web terminal</span>
        </div>
        <div className="agent-chip" data-online={online}>
          <span className="dot" data-status={online ? "ready" : "disconnected"} />
          {gatewayUrl
            ? `gateway · ${onlineHosts.length}/${hosts.length} hosts`
            : agentInfo
              ? `agent · ${agentInfo.platform}`
              : "no agent (demo only)"}
        </div>
      </div>

      <div className="tabrow">
        <TabBar
          sessions={sessions}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeSession}
          onAdd={() => setMenuOpen((v) => !v)}
          menuOpen={menuOpen}
        />
        {menuOpen && (
          <div className="add-menu" role="menu">
            <button role="menuitem" onClick={() => addSession("demo")}>
              Demo shell
            </button>
            {gatewayUrl ? (
              hosts.length ? (
                hosts.flatMap((h) =>
                  (h.shells && h.shells.length ? h.shells : [""]).map((sh) => (
                    <button
                      key={`${h.id}:${sh}`}
                      role="menuitem"
                      disabled={!h.online}
                      title={h.online ? h.platform : h.error}
                      onClick={() => addSession("agent", sh || undefined, h.id)}
                    >
                      {h.label}
                      {sh ? ` · ${sh}` : ""}
                      {h.online ? "" : " (offline)"}
                    </button>
                  ))
                )
              ) : (
                <button role="menuitem" disabled>
                  Gateway: no hosts
                </button>
              )
            ) : agentInfo ? (
              agentInfo.shells.map((sh) => (
                <button key={sh} role="menuitem" onClick={() => addSession("agent", sh)}>
                  {sh}
                </button>
              ))
            ) : (
              <button role="menuitem" disabled title="start a pty agent and rebuild with VITE_AGENT_URL">
                Agent shells (no agent found)
              </button>
            )}
          </div>
        )}
      </div>

      <main className="term-area">
        {sessions.map((s) => (
          <TerminalView key={s.id} session={s} active={s.id === activeId} onExit={exitSession} />
        ))}
      </main>
    </div>
  );
}
