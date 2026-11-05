# Security

## Data handling

- The server canonicalizes and hashes the memory in its local process.
- `prepare_memory` returns the memory and an inscription recipe to the MCP caller. It does not broadcast Bitcoin transactions.
- `verify_inscription` may fetch public inscription content from an Ordinals explorer when `inscription_id` is supplied.
- This project has no storage service, telemetry, or account system.

## Scope and risks

- **Permanence:** On-chain Ordinals inscription content under TAP-indexed Bitcoin L1. Fees, fee rates, and indexer availability are external.
- **Verification:** Content match via local hash and optional HTTP fetch of public inscription bytes. Explorers can be wrong, rate-limit, or change URLs; treat explorer fetch as assistive, not sole consensus.
- **Privacy:** Inscription content is public. Do not inscribe secrets or low-entropy private memories you cannot disclose.
- **Authenticity:** A receipt does not prove authorship, identity, ownership, or truth. Use a separate signature scheme if attribution matters.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository if it is enabled. If private reporting is unavailable, contact the maintainers through a verified project channel before filing a public issue. Share a minimal reproduction and avoid including private memory content, secrets, or personal data.
