# Security

## Data handling

- The server canonicalizes and hashes the memory in its local process.
- It sends only the raw 32-byte SHA-256 digest—not the memory plaintext—to public OpenTimestamps calendar `/digest` endpoints.
- It returns the memory and base64 `.ots` receipt to the MCP caller. This project has no storage service, telemetry, or account system.
- Calendar operators receive the request and may observe connection metadata such as the caller's IP address.

## Scope and risks

- **Timestamp:** Once anchored, an OpenTimestamps proof establishes that the exact hashed bytes existed no later than the Bitcoin block time. Calendar availability and Bitcoin confirmation timing are external dependencies.
- **Local verification:** `verify_receipt` checks canonical memory bytes against the receipt's magic/version/hash-op header and digest. It does not parse the timestamp operations or prove Bitcoin inclusion; use the OpenTimestamps client or live verifier for that.
- **Privacy:** A digest does not directly disclose its preimage, but short or guessable content may be tested offline. Do not publish hashes of low-entropy private memories without considering this risk.
- **Authenticity:** A receipt does not prove authorship, identity, ownership, or truth. Use a separate signature and identity-verification scheme if attribution matters.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository if it is enabled. If private reporting is unavailable, contact the maintainers through a verified project channel before filing a public issue. Share a minimal reproduction and avoid including private memory content, secrets, or personal data.

