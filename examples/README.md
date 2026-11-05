# Example: prepare, then verify

Prove the tools locally (Node.js 18+):

```sh
npm ci
node examples/run-demo.mjs
```

[`run-demo.mjs`](./run-demo.mjs) reads [`demo-memory.json`](./demo-memory.json), calls `prepare_memory`, and checks [`expected-digest.json`](./expected-digest.json). It then calls `verify_inscription` with `fetch_content: false` and `include_trac: false`.

| Check | Value |
| --- | --- |
| `sha256` | `76f3f9ff531cecbfe46e676e932f9b0d9d02b3d7c04e5a558924a8092cb0294b` |
| `byte_length` | 170 |
| `status` | `prepared` |
| `matches_expected_sha256` | true |
| `ok` | false until the bytes are inscribed |

`created_at` is fixed, so the digest stays put. [`stamp-example.json`](./stamp-example.json) is the same payload without `created_at`. `prepare_memory` then fills the current UTC second, and the digest changes on every call.

The same memory can be prepared in the browser with no install: [Anchor](https://misty-flame-3nw3.here.now/#anchor), then [Verify](https://misty-flame-3nw3.here.now/#verify). Canonical byte rules: [llms.txt](https://misty-flame-3nw3.here.now/llms.txt). Repo index: [`../llms.txt`](../llms.txt).

## 1. Prepare a memory

Call `prepare_memory` with [`demo-memory.json`](./demo-memory.json):

```json
{
  "agent_id": "demo-agent",
  "key": "prefs/style",
  "content": "User prefers concise diffs and UTC-5 timestamps.",
  "tags": ["preferences", "ui"],
  "created_at": "2026-11-05T19:00:00Z"
}
```

The result includes `memory`, `canonical`, `sha256`, `status: "prepared"`, and `inscription_recipe`. Inscribe `inscription_recipe.content_utf8` on Bitcoin (TAP Wallet or any Ordinals/TAP tool). This tool does not pay fees or broadcast.

## 2. After inscription

Store `memory` with the resulting `inscription_id` and `txid`.

## 3. Verify

Before an inscription exists, call `verify_inscription` to prove the local digest:

```json
{
  "memory": {
    "agent_id": "demo-agent",
    "content": "User prefers concise diffs and UTC-5 timestamps.",
    "created_at": "2026-11-05T19:00:00Z",
    "key": "prefs/style",
    "tags": ["preferences", "ui"]
  },
  "sha256": "76f3f9ff531cecbfe46e676e932f9b0d9d02b3d7c04e5a558924a8092cb0294b",
  "fetch_content": false,
  "include_trac": false
}
```

Expect `matches_expected_sha256: true` and `ok: false`.

After inscription, call again with the real id and let content fetch stay on (the default when `inscription_id` is set):

```json
{
  "memory": { "...": "full memory object from prepare_memory" },
  "inscription_id": "<txid>i0",
  "sha256": "76f3f9ff531cecbfe46e676e932f9b0d9d02b3d7c04e5a558924a8092cb0294b"
}
```

A successful content fetch confirms the on-chain bytes match. You can also open the returned `explorer_links`.

Live browser UI: https://misty-flame-3nw3.here.now/
