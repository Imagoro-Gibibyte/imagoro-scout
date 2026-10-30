# keygate

Per-client key auth and model scoping for engines that have none (Ollama), or as a second key in front of vLLM. One file, Python stdlib, Windows and Linux.

```sh
python keygate.py add-key --config gate.json --name agent-box --models qwen3:8b   # prints the key once
python keygate.py serve   --config gate.json
python keygate.py forward --listen 127.0.0.1:18000 --upstream http://GATE:8000 --key-file client.key
python -m unittest test_keygate                                                    # 16 tests
```

`gate.json`:
```json
{ "listen_host": "127.0.0.1", "listen_port": 11435, "upstream": "http://127.0.0.1:11434",
  "upstream_key_file": null, "max_body_bytes": 4194304, "timeout_s": 600, "keys": [] }
```

- Keys are stored as SHA-256 and compared in constant time. Each key has a model list, and `*` means all.
- Forwarded: inference endpoints plus read-only listing (`/api/tags` and `/v1/models`, filtered per key). Pull, create, copy, delete and push are unreachable.
- A bad key gets 401; anything else refused gets a uniform 404. Body limit 4 MiB.
- `forward` only listens on loopback. It replaces whatever key the caller sends with the key from the file.
- When it can't bind its address (for example, the VPN is still coming up), it keeps retrying. `bind_retries` caps that.

Put the engine on loopback and run the gate on the address clients reach; nothing else is exposed.
