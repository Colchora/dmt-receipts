# DMT Receipts

**Portable, Bitcoin-permanent agent memories via the TAP Protocol / Ordinals.**

DMT Receipts turns a canonical `dmt-memory/v1` JSON object into an inscription-ready payload. Permanence means the memory bytes are committed on Bitcoin L1 as Ordinals inscription content under [TAP](https://docs.tap-protocol.com/) (`"p":"tap"`). Keep the memory and inscription id / txid in storage you control.

[Live site](https://misty-flame-3nw3.here.now/) · [Protocol recipe](https://misty-flame-3nw3.here.now/llms.txt) · [Full specification](https://misty-flame-3nw3.here.now/spec.md) · [TAP specs](https://github.com/Trac-Systems/tap-protocol-specs)

[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933.svg)](https://nodejs.org/)

Maintainer: [github.com/Colchora](https://github.com/Colchora)

## Start here

The live site prepares and verifies a memory in the browser. Nothing is uploaded; receipts stay in `localStorage` until you export them. This package is the same protocol as a local MCP server. It is not published to the npm registry, so install it from a clone (below) or use the site.

| What you want | Where |
| --- | --- |
| Prepare a memory, no install | [Live app → Anchor](https://misty-flame-3nw3.here.now/#anchor) |
| Verify an inscription | [Live app → Verify](https://misty-flame-3nw3.here.now/#verify) |
| Receipts saved in this browser | [Live app → Receipts](https://misty-flame-3nw3.here.now/#receipts) |
| One-file recipe for agents | [llms.txt](https://misty-flame-3nw3.here.now/llms.txt) |
| Full protocol | [spec.md](https://misty-flame-3nw3.here.now/spec.md) |
| Machine-readable manifest | [agent.json](https://misty-flame-3nw3.here.now/agent.json) |
| MCP registry id | `io.github.Colchora/dmt-receipts` |

Optional honor-system funding is separate from inscription fees: [Support](https://misty-flame-3nw3.here.now/#support) and [Buyback](https://misty-flame-3nw3.here.now/#buyback).

## What a receipt does—and does not—establish

| A receipt can establish | A receipt cannot establish |
| --- | --- |
| These exact canonical bytes were inscribed as Ordinals content in a Bitcoin transaction (when `inscription_id` / content match). | Who created or owns those bytes; authorship needs a separate signature scheme. |
| Local `verify_inscription` can recompute the digest and optionally fetch public inscription content for comparison. | Truth, accuracy, originality, intent, or exclusive ownership of the memory. |
| TAP indexers / Ordinals explorers can show the inscription independently of this repo. | A free hash-only calendar proof. Inscription fees are real Bitcoin fees. |

This MCP server **does not** broadcast transactions or pay fees. Status after `prepare_memory` is **prepared**, not inscribed.

## Quickstart

```sh
git clone https://github.com/Colchora/dmt-receipts.git
cd dmt-receipts
npm install
node dist/index.js
```

`npm install` builds `dist/` (Node.js 18+). Cursor, Claude Desktop, and other MCP clients use the same stdio config. In Cursor, put it in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dmt-receipts": {
      "command": "node",
      "args": ["/absolute/path/to/dmt-receipts/dist/index.js"]
    }
  }
}
```

Tools:

- `prepare_memory` — canonicalize a memory, hash it, and return an Ordinals/TAP inscription recipe (content UTF-8 + optional `dta` pointer).
- `verify_inscription` — recompute the digest; optionally fetch inscription content and compare; return explorer links.

See [`examples/README.md`](./examples/README.md).

## Prepare, inscribe, verify

1. Call `prepare_memory` with `agent_id`, `key`, and `content`.
2. Inscribe `inscription_recipe.content_utf8` as Ordinals content (`application/json` or `text/plain`) with TAP Wallet or any Ordinals/TAP tool. Optional TAP `dta` (≤512 bytes) may carry `sha256:<hex>` on token-deploy flows.
3. Store the memory with `inscription_id` / `txid`.
4. Call `verify_inscription` with the memory and `inscription_id`.

The same prepare and verify steps work in the browser with no install: [Anchor](https://misty-flame-3nw3.here.now/#anchor), then [Verify](https://misty-flame-3nw3.here.now/#verify).

## Canonical memory format

Compact UTF-8 JSON, no trailing newline, keys sorted by Unicode code point, literal non-ASCII:

```json
{"agent_id":"demo-agent","content":"Remember this exact state.","created_at":"2026-11-05T17:00:00Z","key":"notes/hello","tags":["demo"]}
```

| Field | Type | Notes |
| --- | --- | --- |
| `agent_id` | string | Stable identifier for the agent. |
| `key` | string | Memory key, slug, or path. |
| `content` | string, object, array, number, or boolean | Nested values must be JSON-compatible. |
| `tags` | array of strings | Use `[]` when there are no tags. |
| `created_at` | string | ISO-8601 UTC ending in `Z`, whole-second precision. |
| *(extensions)* | any JSON value | Optional. Extra fields are sorted with everything else and included in the hash. `prepare_memory` keeps additional tool arguments. |

## Protocol and privacy

Inscription content is public on Bitcoin. Do not inscribe secrets. This tool never uploads memory bytes to a backend of its own; if you fetch content during verify, you contact a public explorer.

## License

MIT


## Support & Tap buyback

Optional honor-system funding lives on the live site:

- [Support plans](https://misty-flame-3nw3.here.now/#support) — Free prepare, Support, Tap buyback
- [Buyback hub](https://misty-flame-3nw3.here.now/#buyback) — **all contribution proceeds** are directed here (USDC address + local payment-reference log)

Prepare/inscribe memory tooling stays free aside from Bitcoin network inscription fees paid to miners/inscribers. This repository does not process card payments.
