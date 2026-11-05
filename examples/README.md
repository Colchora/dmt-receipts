# Example: prepare, then verify

The same walkthrough runs in the browser with no install: [Anchor](https://misty-flame-3nw3.here.now/#anchor) to prepare, then [Verify](https://misty-flame-3nw3.here.now/#verify). Agents can follow [llms.txt](https://misty-flame-3nw3.here.now/llms.txt) or the [spec](https://misty-flame-3nw3.here.now/spec.md).

This walkthrough uses [`stamp-example.json`](./stamp-example.json) as input to the MCP `prepare_memory` tool. Paste those fields into the live Anchor form, or call the tool.

## 1. Prepare a memory

Call `prepare_memory` with:

```json
{
  "agent_id": "demo-agent",
  "key": "prefs/style",
  "content": "User prefers concise diffs and UTC-5 timestamps.",
  "tags": ["preferences", "ui"]
}
```

The result includes `memory`, `canonical`, `sha256`, `status: "prepared"`, and `inscription_recipe`. Inscribe `inscription_recipe.content_utf8` on Bitcoin (TAP Wallet or any Ordinals/TAP tool). This tool does not pay fees or broadcast.

## 2. After inscription

Store `memory` with the resulting `inscription_id` and `txid`.

## 3. Verify

Call `verify_inscription`:

```json
{
  "memory": { "...": "full memory object from prepare_memory" },
  "inscription_id": "<txid>i0",
  "sha256": "<hex from prepare_memory>"
}
```

A successful content fetch confirms the on-chain bytes match. You can also open the returned `explorer_links`.

Live browser UI: https://misty-flame-3nw3.here.now/
