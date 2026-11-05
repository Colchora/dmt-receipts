# Hermes polish changelog

- Rewrote `README.md` with an honest-scope table, local MCP quickstart/config, stamp-to-verification flow, canonical format notes, privacy details, and live protocol links.
- Restructured `src/index.ts` with file/protocol comments, recursive canonical sorted-key JSON, input and receipt validation, concurrent calendar requests with endpoint-specific errors, and explicit local-verification limits. Kept the `stamp_memory` and `verify_receipt` tools.
- Kept `examples/stamp-example.json` and added `examples/README.md` documenting stamp, local check, and Bitcoin-proof verification.
- Added `CONTRIBUTING.md` and clarified `SECURITY.md` data handling, limits, privacy risks, and vulnerability reporting.
- Refined package description, keywords, author metadata, and included release documentation/examples in package files; preserved MIT licensing and the `mcpName` placeholder.
