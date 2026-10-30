#!/usr/bin/env python3
"""ollama-keygate: per-client key auth and model scoping in front of an Ollama daemon.

Ollama has no authentication. This puts it on loopback and exposes a small, fixed
surface on the mesh address instead:

- every request needs ``Authorization: Bearer <key>`` (or ``X-Api-Key``); keys are
  stored as SHA-256 hashes, each with a client name and a model allowlist;
- only inference and read-only listing endpoints are forwarded; model management
  (pull, push, create, copy, delete, ...) is never reachable through the gate;
- the request's ``model`` must be on that key's allowlist, and ``/api/tags`` /
  ``/v1/models`` only list allowed models;
- missing or wrong key -> 401; anything else refused -> uniform 404.

Stdlib only, so the same file runs on Windows and Debian.

The upstream can be any OpenAI-compatible engine (vLLM too); with ``upstream_key_file``
in the config the gate authenticates to it (e.g. vLLM ``--api-key``).

``forward`` is the client-side half: a loopback-only listener that adds a key from a
root-only file and forwards to a remote gate, so harnesses that can only hold one key
(or none) reach a keyed engine through a localhost URL.

  keygate.py serve   --config CONFIG
  keygate.py forward --listen 127.0.0.1:PORT --upstream URL --key-file FILE
  keygate.py add-key --config CONFIG --name NAME --models m1,m2   (prints the key once)
  keygate.py revoke  --config CONFIG --name NAME
  keygate.py list    --config CONFIG
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import http.client
import json
import os
import secrets
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

# Forwarded endpoints. Value: does the body carry a "model" that must be allowed?
POST_ENDPOINTS = {
    "/v1/chat/completions": True,
    "/v1/completions": True,
    "/v1/embeddings": True,
    "/api/chat": True,
    "/api/generate": True,
    "/api/embed": True,
    "/api/embeddings": True,
    "/api/show": True,
}
GET_ENDPOINTS = {"/api/tags", "/v1/models", "/api/version"}

DEFAULT_MAX_BODY = 4 * 1024 * 1024


def norm_model(name: str) -> str:
    name = (name or "").strip()
    return name[: -len(":latest")] if name.endswith(":latest") else name


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
    if not isinstance(cfg.get("keys"), list):
        raise ValueError("config: 'keys' must be a list")
    for k in cfg["keys"]:
        if not (k.get("name") and len(k.get("sha256", "")) == 64 and isinstance(k.get("models"), list)):
            raise ValueError(f"config: bad key entry {k.get('name')!r}")
    if not urlsplit(cfg.get("upstream", "")).hostname:
        raise ValueError("config: 'upstream' must be a URL like http://127.0.0.1:11435")
    cfg["_upstream_key"] = read_key_file(cfg["upstream_key_file"]) if cfg.get("upstream_key_file") else ""
    return cfg


def read_key_file(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        key = f.read().strip()
    if not key:
        raise ValueError(f"key file {path} is empty")
    return key


def save_config(path: str, cfg: dict) -> None:
    cfg = {k: v for k, v in cfg.items() if not k.startswith("_")}
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def find_client(cfg: dict, presented: str | None):
    """Return the key entry for a presented key, comparing every hash in constant time."""
    if not presented:
        return None
    digest = hash_key(presented)
    match = None
    for entry in cfg["keys"]:
        if hmac.compare_digest(digest, entry["sha256"]):
            match = entry
    return match


def presented_key(headers) -> str | None:
    auth = headers.get("Authorization") or ""
    if auth[:7].lower() == "bearer ":
        return auth[7:].strip() or None
    return (headers.get("X-Api-Key") or "").strip() or None


def model_allowed(entry: dict, model: str) -> bool:
    allowed = {norm_model(m) for m in entry["models"]}
    return "*" in allowed or norm_model(model) in allowed


def filter_listing(path: str, body: bytes, entry: dict) -> bytes:
    data = json.loads(body.decode("utf-8"))
    if path == "/api/tags":
        data["models"] = [m for m in data.get("models", []) if model_allowed(entry, m.get("name", ""))]
    elif path == "/v1/models":
        data["data"] = [m for m in data.get("data", []) if model_allowed(entry, m.get("id", ""))]
    return json.dumps(data).encode("utf-8")


class Gate(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "keygate"
    sys_version = ""
    cfg: dict = {}

    def log_message(self, fmt, *args):  # request lines are logged by _log instead
        pass

    def _log(self, client: str, status: int, model: str = "") -> None:
        sys.stderr.write(
            f"{time.strftime('%Y-%m-%dT%H:%M:%S')} client={client} {self.command} {self.path.split('?')[0]} "
            f"model={model or '-'} status={status} peer={self.client_address[0]}\n"
        )

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _deny(self, client: str, status: int, model: str = "") -> None:
        self._log(client, status, model)
        if status == 401:
            self._send(401, {"error": "unauthorized"})
        else:
            self._send(404, {"error": "not found"})

    def _handle(self) -> None:
        path = self.path.split("?")[0]
        entry = find_client(self.cfg, presented_key(self.headers))
        if entry is None:
            # Drain a small body so the client sees the 401 instead of a reset.
            length = int(self.headers.get("Content-Length") or 0)
            if 0 < length <= 65536:
                self.rfile.read(length)
            self.close_connection = True
            return self._deny("-", 401)
        name = entry["name"]

        if self.command == "GET" and path in GET_ENDPOINTS:
            return self._forward(entry, path, b"", "")
        if self.command != "POST" or path not in POST_ENDPOINTS:
            self.close_connection = True
            return self._deny(name, 404)

        if self.headers.get("Transfer-Encoding"):
            self.close_connection = True
            return self._deny(name, 404)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > int(self.cfg.get("max_body_bytes", DEFAULT_MAX_BODY)):
            self.close_connection = True
            return self._deny(name, 404)
        body = self.rfile.read(length)
        try:
            data = json.loads(body.decode("utf-8"))
            model = data.get("model") or data.get("name") or ""
        except (ValueError, AttributeError):
            return self._deny(name, 404)
        if not isinstance(model, str) or not model_allowed(entry, model):
            return self._deny(name, 404, str(model)[:80])
        return self._forward(entry, path, body, model)

    def _forward(self, entry: dict, path: str, body: bytes, model: str) -> None:
        up = urlsplit(self.cfg["upstream"])
        conn = http.client.HTTPConnection(up.hostname, up.port or 80, timeout=float(self.cfg.get("timeout_s", 600)))
        try:
            headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
            if self.cfg.get("_upstream_key"):
                headers["Authorization"] = f"Bearer {self.cfg['_upstream_key']}"
            conn.request(self.command, path, body=body if body else None, headers=headers)
            resp = conn.getresponse()
            if path in ("/api/tags", "/v1/models") and resp.status == 200:
                data = filter_listing(path, resp.read(), entry)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                # Stream (Ollama and OpenAI-compatible streaming both arrive chunked).
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.getheader("Content-Type", "application/json"))
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                while True:
                    chunk = resp.read1(65536) if hasattr(resp, "read1") else resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
            self._log(entry["name"], resp.status, model)
        except OSError:
            self._log(entry["name"], 502, model)
            self.close_connection = True
            try:
                self._send(502, {"error": "upstream unavailable"})
            except OSError:
                pass
        finally:
            conn.close()

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_PUT(self):
        self._handle()

    def do_DELETE(self):
        self._handle()

    def do_HEAD(self):
        self._handle()

    def do_PATCH(self):
        self._handle()

    def do_OPTIONS(self):
        self._handle()


class Forwarder(BaseHTTPRequestHandler):
    """Loopback-only client sidecar: drop the caller's auth, add ours, stream through."""

    protocol_version = "HTTP/1.1"
    server_version = "keygate-forward"
    sys_version = ""
    upstream = ""
    key = ""

    def log_message(self, fmt, *args):
        pass

    def _relay(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        if self.headers.get("Transfer-Encoding") or length > DEFAULT_MAX_BODY:
            self.close_connection = True
            self.send_response(413)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body = self.rfile.read(length) if length else b""
        up = urlsplit(self.upstream)
        conn = http.client.HTTPConnection(up.hostname, up.port or 80, timeout=900)
        try:
            headers = {"Content-Type": self.headers.get("Content-Type", "application/json"),
                       "Content-Length": str(len(body)), "Authorization": f"Bearer {self.key}"}
            conn.request(self.command, self.path, body=body if body else None, headers=headers)
            resp = conn.getresponse()
            self.send_response(resp.status)
            self.send_header("Content-Type", resp.getheader("Content-Type", "application/json"))
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            while True:
                chunk = resp.read1(65536) if hasattr(resp, "read1") else resp.read(65536)
                if not chunk:
                    break
                self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
        except OSError:
            self.close_connection = True
            try:
                body = b'{"error": "upstream unavailable"}'
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except OSError:
                pass
        finally:
            conn.close()

    do_GET = do_POST = _relay


def forward(listen: str, upstream: str, key_file: str) -> None:
    host, _, port = listen.rpartition(":")
    if host not in ("127.0.0.1", "::1", "localhost"):
        sys.exit("keygate forward: listen address must be loopback")
    if not urlsplit(upstream).hostname:
        sys.exit("keygate forward: --upstream must be a URL")
    Forwarder.upstream = upstream.rstrip("/")
    Forwarder.key = read_key_file(key_file)
    httpd = ThreadingHTTPServer((host, int(port)), Forwarder)
    httpd.daemon_threads = True
    sys.stderr.write(f"keygate forward: {listen} -> {Forwarder.upstream}\n")
    httpd.serve_forever()


def serve(cfg_path: str) -> None:
    cfg = load_config(cfg_path)
    if not cfg["keys"]:
        sys.exit("keygate: refusing to start with no keys")
    Gate.cfg = cfg
    host, port = cfg.get("listen_host", "127.0.0.1"), int(cfg.get("listen_port", 11435))
    # The mesh address may not exist yet (WireGuard still coming up, or the tunnel was down at
    # boot): keep retrying. bind_retries > 0 caps the attempts; the default waits indefinitely,
    # since a gate waiting for its address exposes nothing.
    retries = int(cfg.get("bind_retries", 0))
    attempt = 0
    while True:
        try:
            httpd = ThreadingHTTPServer((host, port), Gate)
            break
        except OSError as e:
            if attempt == 0 or attempt % 120 == 0:  # first failure, then every ~10 min
                sys.stderr.write(f"keygate: waiting to bind {host}:{port} ({e})\n")
            attempt += 1
            if retries > 0 and attempt >= retries:
                sys.exit(f"keygate: could not bind {host}:{port}")
            time.sleep(5)
    httpd.daemon_threads = True
    sys.stderr.write(f"keygate: {host}:{port} -> {cfg['upstream']} ({len(cfg['keys'])} keys)\n")
    httpd.serve_forever()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="keygate")
    sub = ap.add_subparsers(dest="cmd", required=True)
    fw = sub.add_parser("forward")
    fw.add_argument("--listen", required=True, help="loopback host:port")
    fw.add_argument("--upstream", required=True, help="remote gate URL")
    fw.add_argument("--key-file", required=True)
    for name in ("serve", "add-key", "revoke", "list"):
        p = sub.add_parser(name)
        p.add_argument("--config", required=True)
        if name == "add-key":
            p.add_argument("--name", required=True)
            p.add_argument("--models", required=True, help="comma-separated; '*' = all")
        if name == "revoke":
            p.add_argument("--name", required=True)
    a = ap.parse_args(argv)

    if a.cmd == "serve":
        serve(a.config)
        return 0
    if a.cmd == "forward":
        forward(a.listen, a.upstream, a.key_file)
        return 0
    cfg = load_config(a.config)
    if a.cmd == "list":
        for k in cfg["keys"]:
            print(f"{k['name']}\t{','.join(k['models'])}\t{k.get('created', '')}")
    elif a.cmd == "add-key":
        if any(k["name"] == a.name for k in cfg["keys"]):
            sys.exit(f"keygate: key {a.name!r} exists; revoke it first")
        key = "kg_" + secrets.token_urlsafe(32)
        models = [m.strip() for m in a.models.split(",") if m.strip()]
        cfg["keys"].append({"name": a.name, "sha256": hash_key(key), "models": models,
                            "created": time.strftime("%Y-%m-%d")})
        save_config(a.config, cfg)
        print(key)  # shown once; pipe it straight to the client, don't paste it anywhere
    elif a.cmd == "revoke":
        before = len(cfg["keys"])
        cfg["keys"] = [k for k in cfg["keys"] if k["name"] != a.name]
        if len(cfg["keys"]) == before:
            sys.exit(f"keygate: no key {a.name!r}")
        save_config(a.config, cfg)
        print(f"revoked {a.name} (restart the gate to apply)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
