"""End-to-end tests: a fake Ollama upstream, a real gate, real HTTP. Run: python -m unittest -v"""
import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import keygate  # noqa: E402

SEEN = []


class FakeOllama(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _reply(self, obj, chunked=False):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        if chunked:
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            for part in (body[:5], body[5:]):
                self.wfile.write(b"%x\r\n%s\r\n" % (len(part), part))
            self.wfile.write(b"0\r\n\r\n")
        else:
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_GET(self):
        SEEN.append(("GET", self.path, dict(self.headers)))
        if self.path == "/api/tags":
            self._reply({"models": [{"name": "qwen3:14b"}, {"name": "neuraldaredevil:latest"}]})
        elif self.path == "/v1/models":
            self._reply({"data": [{"id": "qwen3:14b"}, {"id": "neuraldaredevil:latest"}]})
        else:
            self._reply({"version": "0.0"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n))
        SEEN.append(("POST", self.path, dict(self.headers)))
        self._reply({"model": body.get("model"), "ok": True}, chunked=True)

    do_DELETE = do_POST


def start(handler, cfg=None):
    if cfg is not None:
        handler.cfg = cfg
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class KeygateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.up = start(FakeOllama)
        cls.key = "kg_test_key_123"
        cls.cfg = {
            "upstream": f"http://127.0.0.1:{cls.up.server_address[1]}",
            "max_body_bytes": 2048,
            "keys": [{"name": "nuc", "sha256": keygate.hash_key(cls.key), "models": ["qwen3:14b"]}],
        }
        cls.gate = start(keygate.Gate, cls.cfg)

    @classmethod
    def tearDownClass(cls):
        cls.gate.shutdown()
        cls.up.shutdown()

    def req(self, method, path, body=None, key="__default__", headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.gate.server_address[1], timeout=5)
        h = dict(headers or {})
        if key == "__default__":
            key = self.key
        if key:
            h["Authorization"] = f"Bearer {key}"
        data = json.dumps(body).encode() if body is not None else None
        if data is not None:
            h["Content-Type"] = "application/json"
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        out = r.status, r.read()
        c.close()
        return out

    def test_no_key_401(self):
        self.assertEqual(self.req("GET", "/api/tags", key=None)[0], 401)

    def test_wrong_key_401(self):
        self.assertEqual(self.req("POST", "/api/chat", {"model": "qwen3:14b"}, key="kg_nope")[0], 401)

    def test_x_api_key_header(self):
        st, _ = self.req("GET", "/api/version", key=None, headers={"X-Api-Key": self.key})
        self.assertEqual(st, 200)

    def test_allowed_model_streams_through(self):
        st, body = self.req("POST", "/v1/chat/completions", {"model": "qwen3:14b", "messages": []})
        self.assertEqual(st, 200)
        self.assertEqual(json.loads(body)["model"], "qwen3:14b")

    def test_latest_suffix_normalised(self):
        self.assertEqual(self.req("POST", "/api/generate", {"model": "qwen3:14b:latest"})[0], 200)

    def test_disallowed_model_404_and_not_forwarded(self):
        before = len(SEEN)
        self.assertEqual(self.req("POST", "/api/chat", {"model": "neuraldaredevil"})[0], 404)
        self.assertEqual(len(SEEN), before)

    def test_management_endpoints_404(self):
        for path in ("/api/pull", "/api/create", "/api/copy", "/api/push", "/api/blobs/x"):
            self.assertEqual(self.req("POST", path, {"model": "qwen3:14b"})[0], 404, path)
        self.assertEqual(self.req("DELETE", "/api/delete", {"model": "qwen3:14b"})[0], 404)

    def test_listing_filtered(self):
        st, body = self.req("GET", "/api/tags")
        self.assertEqual([m["name"] for m in json.loads(body)["models"]], ["qwen3:14b"])
        st, body = self.req("GET", "/v1/models")
        self.assertEqual([m["id"] for m in json.loads(body)["data"]], ["qwen3:14b"])

    def test_oversize_body_404(self):
        big = {"model": "qwen3:14b", "prompt": "x" * 4096}
        self.assertEqual(self.req("POST", "/api/generate", big)[0], 404)

    def test_bad_json_404(self):
        c = http.client.HTTPConnection("127.0.0.1", self.gate.server_address[1], timeout=5)
        c.request("POST", "/api/chat", body=b"{not json", headers={"Authorization": f"Bearer {self.key}"})
        self.assertEqual(c.getresponse().status, 404)

    def test_client_auth_header_not_forwarded(self):
        self.req("POST", "/api/chat", {"model": "qwen3:14b"})
        _, _, headers = SEEN[-1]
        self.assertNotIn("Authorization", headers)


class ChainTest(unittest.TestCase):
    """client -> forward sidecar (adds key) -> gate (checks key, adds upstream key) -> engine."""

    @classmethod
    def setUpClass(cls):
        cls.up = start(FakeOllama)
        cls.tmp = tempfile.TemporaryDirectory()
        up_key = os.path.join(cls.tmp.name, "upstream.key")
        client_key = os.path.join(cls.tmp.name, "client.key")
        with open(up_key, "w") as f:
            f.write("vllm-secret\n")
        with open(client_key, "w") as f:
            f.write("kg_chain\n")
        cfg_path = os.path.join(cls.tmp.name, "gate.json")
        keygate.save_config(cfg_path, {
            "upstream": f"http://127.0.0.1:{cls.up.server_address[1]}",
            "upstream_key_file": up_key,
            "keys": [{"name": "kao", "sha256": keygate.hash_key("kg_chain"), "models": ["qwen3-8b"]}],
        })

        class G(keygate.Gate):
            cfg = keygate.load_config(cfg_path)

        cls.gate = start(G)

        class F(keygate.Forwarder):
            upstream = f"http://127.0.0.1:{cls.gate.server_address[1]}"
            key = keygate.read_key_file(client_key)

        cls.fwd = start(F)

    @classmethod
    def tearDownClass(cls):
        for s in (cls.fwd, cls.gate, cls.up):
            s.shutdown()
        cls.tmp.cleanup()

    def post(self, body, auth=None):
        c = http.client.HTTPConnection("127.0.0.1", self.fwd.server_address[1], timeout=5)
        h = {"Content-Type": "application/json"}
        if auth:
            h["Authorization"] = auth
        c.request("POST", "/v1/chat/completions", body=json.dumps(body), headers=h)
        r = c.getresponse()
        return r.status, r.read()

    def test_chain_adds_both_keys(self):
        st, body = self.post({"model": "qwen3-8b", "messages": []}, auth="Bearer ollama")
        self.assertEqual(st, 200)
        _, _, headers = SEEN[-1]
        self.assertEqual(headers.get("Authorization"), "Bearer vllm-secret")

    def test_chain_still_scopes_models(self):
        self.assertEqual(self.post({"model": "neuraldaredevil"})[0], 404)

    def test_forward_refuses_non_loopback(self):
        with self.assertRaises(SystemExit):
            keygate.forward("0.0.0.0:0", "http://127.0.0.1:1", os.path.join(self.tmp.name, "client.key"))


class CliTest(unittest.TestCase):
    def test_add_list_revoke(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "c.json")
            keygate.save_config(p, {"upstream": "http://127.0.0.1:11435", "keys": []})
            keygate.main(["add-key", "--config", p, "--name", "a", "--models", "qwen3:14b"])
            cfg = keygate.load_config(p)
            self.assertEqual(cfg["keys"][0]["name"], "a")
            self.assertNotIn("kg_", json.dumps(cfg))  # only the hash is stored
            with self.assertRaises(SystemExit):
                keygate.main(["add-key", "--config", p, "--name", "a", "--models", "x"])
            keygate.main(["revoke", "--config", p, "--name", "a"])
            self.assertEqual(keygate.load_config(p)["keys"], [])

    def test_bad_config_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "c.json")
            keygate.save_config(p, {"upstream": "nope", "keys": []})
            with self.assertRaises(ValueError):
                keygate.load_config(p)


if __name__ == "__main__":
    unittest.main()
