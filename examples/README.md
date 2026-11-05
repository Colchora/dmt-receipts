# Example: stamp, then verify

This walkthrough uses [`stamp-example.json`](./stamp-example.json) as the input to the MCP `stamp_memory` tool. The file shows the required fields; the tool fills in `created_at` when it is omitted.

## 1. Stamp a memory

Call `stamp_memory` with the contents of the example. Only `agent_id`, `key`, and `content` are required; `tags` defaults to `[]`, and `created_at` is generated in UTC if omitted:

```json
{
  "agent_id": "demo-agent",
  "key": "prefs/style",
  "content": "User prefers concise diffs and UTC-5 timestamps.",
  "tags": ["preferences", "ui"]
}
```

The result includes `memory`, `canonical`, `sha256`, `calendars`, `status`, and `ots_base64`. Keep the returned `memory` and `ots_base64` together in storage you control. The initial `status` is `pending`; it does not mean the proof is already anchored in a Bitcoin block.

## 2. Check the receipt locally

Call `verify_receipt` with these two arguments from that same `stamp_memory` result:

- `memory`: the complete returned `memory` object, passed as an object (do not stringify it).
- `ots_base64`: the returned base64 string, unchanged.
- `sha256` (optional): the returned hex digest for an additional cross-check.

A successful result confirms the canonical memory digest matches the digest in the receipt header. This local check does not validate timestamp operations or Bitcoin inclusion; use the OpenTimestamps client below for that.

## 3. Verify the Bitcoin proof

Decode `ots_base64` and save the bytes as `memory.json.ots`. Save the `canonical` string exactly as UTF-8 bytes, without adding a newline, as `memory.json`. Once the calendar has upgraded the pending receipt (often around 1–3 hours), run:

```sh
ots upgrade memory.json.ots
ots verify -f memory.json memory.json.ots
```

You can also use the [live browser verifier](https://misty-flame-3nw3.here.now/). For protocol details and limitations, see the [main README](../README.md) and [published specification](https://misty-flame-3nw3.here.now/spec.md).
