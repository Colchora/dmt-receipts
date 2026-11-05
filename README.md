# DMT Receipts

**Portable, Bitcoin-anchored proof-of-existence for agent memories.**

DMT Receipts turns a canonical `dmt-memory/v1` JSON object into a SHA-256 digest and a portable OpenTimestamps receipt. Keep the memory and receipt in storage you control; verify the local digest whenever you need it, then use the OpenTimestamps client or the live verifier for the Bitcoin proof.

[Live site & verifier](https://misty-flame-3nw3.here.now/) · [Protocol recipe](https://misty-flame-3nw3.here.now/llms.txt) · [Full specification](https://misty-flame-3nw3.here.now/spec.md)

[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933.svg)](https://nodejs.org/)

Maintainer: [github.com/many77146-bot](https://github.com/many77146-bot)


## What a receipt does—and does not—establish

| A receipt can establish | A receipt cannot establish |
| --- | --- |
| The exact bytes whose SHA-256 is in the receipt existed **no later than** the Bitcoin block time anchoring the timestamp. | Who created, submitted, or owns those bytes; authorship requires a separate signature and identity-verification scheme. |
| The local `verify_receipt` tool can check the canonical memory digest against the digest in a well-formed OpenTimestamps header. | Truth, accuracy, originality, intent, or exclusive ownership of the memory. |
| After calendar aggregation and Bitcoin anchoring, an upgraded receipt can be checked with the OpenTimestamps client or live verifier. | A full Bitcoin proof from the MCP tool's local check alone. The tool does not validate the receipt's calendar operations or Bitcoin inclusion. |
| The MCP server sends the 32-byte digest to public calendars; it does not send memory plaintext or keep a copy. | Absolute privacy: calendars receive network requests, and a digest of short or guessable content may be vulnerable to offline guessing. |

Stamping submits digests to public OpenTimestamps calendars at no proof fee. Calendar availability and Bitcoin anchoring time are outside this project's control. A newly returned receipt is normally **pending**; it is not yet a confirmed Bitcoin proof.

## Quickstart

This project is a local stdio MCP server. From a clone of this repository, build and run it with Node.js 18 or later:

```sh
npm install
npm run build
node dist/index.js
```

The process speaks MCP over standard input/output. In an MCP client, configure the built entry point instead of running it in a terminal:

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

Replace the path with the absolute path on your machine, then restart or reload your MCP client. The server exposes two tools:

- `stamp_memory` — canonicalize a memory, hash it, submit the digest to the public calendars, and return the memory, canonical JSON, digest, and base64 `.ots` receipt.
- `verify_receipt` — locally compare the memory digest with the `.ots` header. This is a local consistency check, not a Bitcoin-chain verification.

For the complete round-trip example, see [`examples/README.md`](./examples/README.md). Sample Bitcoin-pending OTS memory bundles are in [`receipts/`](./receipts/); pending receipts are not yet confirmed Bitcoin proofs.

## Stamp, keep, verify

1. Call `stamp_memory` with `agent_id`, `key`, and `content`. `tags` defaults to `[]`; `created_at` defaults to the current UTC time.
2. Store the returned `memory` and `ots_base64` yourself. DMT Receipts has no storage service.
3. Pass those same values to `verify_receipt` when you want to check that the memory still matches its receipt.
4. For a Bitcoin-anchored proof, save the decoded receipt as `memory.json.ots`, save the canonical memory bytes as `memory.json`, then run:

   ```sh
   ots upgrade memory.json.ots
   ots verify -f memory.json memory.json.ots
   ```

   Upgrade may take around 1–3 hours, depending on calendar batching. You can also use the [live browser verifier](https://misty-flame-3nw3.here.now/).

The MCP verifier intentionally does not claim the last step: it checks the receipt magic/version/hash-op header and digest, but does not parse the timestamp operations or contact Bitcoin.

## Canonical memory format

The server hashes compact UTF-8 JSON with no trailing newline. Object keys are sorted lexicographically by Unicode code point at every nesting level; arrays keep their order; non-ASCII characters remain literal UTF-8. Numbers must be finite. Avoid floating-point values when memories must hash identically across different language runtimes; use integers or decimal strings instead.

Example canonical bytes:

```json
{"agent_id":"demo-agent","content":"Remember this exact state.","created_at":"2026-11-05T17:00:00Z","key":"notes/hello","tags":["demo"]}
```

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `agent_id` | string | Stable identifier for the agent. |
| `key` | string | Memory key, slug, or path. |
| `content` | string, object, array, number, or boolean | The memory payload; nested values must be JSON-compatible. |
| `tags` | array of strings | Use `[]` when there are no tags. |
| `created_at` | string | Valid ISO-8601 UTC timestamp ending in `Z`, with whole-second precision. |

The server includes optional extension fields in canonical hashing when verifying a memory object. For interoperable numeric serialization, avoid floating-point values as described in the [protocol specification](https://misty-flame-3nw3.here.now/spec.md).

## Protocol and privacy

This MCP implementation follows the published [DMT Receipts recipe](https://misty-flame-3nw3.here.now/llms.txt): it POSTs the raw 32-byte SHA-256 digest to `/digest` at the public OpenTimestamps calendars, using the specified request headers, and assembles the returned operations into an `.ots` receipt. It does not upload memory content. Public calendars still receive the request and its network metadata.

Calendars used (the server attempts all three):

- `https://a.pool.opentimestamps.org/digest`
- `https://b.pool.opentimestamps.org/digest`
- `https://a.pool.eternitywall.com/digest`

See [SECURITY.md](./SECURITY.md) for privacy and reporting notes.

## Project files

- [`src/index.ts`](./src/index.ts) — TypeScript stdio MCP server.
- [`examples/stamp-example.json`](./examples/stamp-example.json) — example input memory.
- [`examples/README.md`](./examples/README.md) — stamp and verification walkthrough.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contribution notes.
- [`LICENSE`](./LICENSE) — MIT.

## License

MIT © Cultura / DMT Receipts contributors. See [LICENSE](./LICENSE).

