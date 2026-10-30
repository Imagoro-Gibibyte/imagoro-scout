import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { termOptions } from "./theme";
import type { Session } from "./types";
import { AgentConnection, agentUrlFromEnv, gatewayUrlFromEnv, type AgentHandlers } from "./agentClient";
import { DemoShell } from "./demo";

type State = "connecting" | "demo" | "ready" | "error" | "exited" | "disconnected";

interface Props {
  session: Session;
  /** Only the active tab is visible; the others stay mounted but hidden. */
  active: boolean;
  onExit: (id: string) => void;
}

export function TerminalView({ session, active, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [state, setState] = useState<State>("connecting");
  const [label, setLabel] = useState("connecting");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm(termOptions);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      /* webgl is optional; the canvas fallback is fine */
    }
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    let conn: AgentConnection | null = null;
    let disposed = false;

    const fitAndResize = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      conn?.resize(term.cols, term.rows);
    };

    if (session.kind === "demo") {
      const demo = new DemoShell((s) => term.write(s));
      setState("demo");
      setLabel("demo shell (no backend)");
      demo.start();
      const sub = term.onData((d) => demo.input(d));
      const ro = new ResizeObserver(() => fitAndResize());
      ro.observe(host);
      return () => {
        sub.dispose();
        ro.disconnect();
        term.dispose();
        termRef.current = null;
      };
    }

    const handlers: AgentHandlers = {
      onOutput: (data) => term.write(data),
      onReady: (info) => {
        setState("ready");
        setLabel(`${info.platform} · ${info.shell}`);
        term.focus();
      },
      onExit: (code) => {
        term.write(`\r\n\x1b[2m[session exited: ${code}]\x1b[0m\r\n`);
        setState("exited");
        setLabel(`exited (${code})`);
      },
      onError: (message) => {
        setState("error");
        setLabel(message);
        term.write(`\r\n\x1b[31m[${message}]\x1b[0m\r\n`);
      },
      onClose: () => {
        if (!disposed) {
          setState("disconnected");
          setLabel("disconnected");
          term.write("\r\n\x1b[2m[disconnected]\x1b[0m\r\n");
        }
      }
    };

    // Prefer the gateway: it authenticates the user and adds agent tokens
    // server-side, so the browser holds no secret. Falls back to a direct agent.
    conn = new AgentConnection(gatewayUrlFromEnv() ?? agentUrlFromEnv(), handlers);
    setState("connecting");
    setLabel("connecting");
    conn.connect({
      cols: term.cols,
      rows: term.rows,
      shell: session.shell,
      host: session.host,
      session: session.id
    });
    term.onData((d) => conn?.input(d));

    const onVisibility = () => {
      if (!document.hidden) fitAndResize();
    };
    const ro = new ResizeObserver(() => fitAndResize());
    ro.observe(host);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      conn?.close();
      term.dispose();
      termRef.current = null;
    };
  }, [session.id, session.kind, session.shell, session.host]);

  useEffect(() => {
    if (active) {
      fitRef.current?.fit();
      termRef.current?.focus();
    }
  }, [active]);

  return (
    <div className="term-pane" data-active={active}>
      <div className="term-host" ref={hostRef} />
      <div className="term-status" title="session status">
        <span className="dot" data-status={state} />
        {label}
        {(state === "exited" || state === "disconnected" || state === "error") && (
          <button className="link" onClick={() => onExit(session.id)}>
            close
          </button>
        )}
      </div>
    </div>
  );
}
