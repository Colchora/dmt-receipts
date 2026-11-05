# DMT Receipts — Draft posts (DO NOT POST)

Saved for Yorgi to paste. Cultura will not post these.

Site: https://misty-flame-3nw3.here.now/
Recipe: https://misty-flame-3nw3.here.now/llms.txt

---

## A) Show HN

**Submit:** https://news.ycombinator.com/submit (or https://news.ycombinator.com/showhn.html)

**Title:**
```
Show HN: DMT Receipts – Bitcoin-timestamped memory receipts for AI agents (no backend)
```

**Body:**
```
I built a small static tool so AI agents (or humans) can prove that a specific memory/bytes existed by a certain Bitcoin block time — without accounts, API keys, or a server that stores your content.

Site: https://misty-flame-3nw3.here.now/
Agent recipe: https://misty-flame-3nw3.here.now/llms.txt

### What it does
1. Canonicalize a memory as sorted-key UTF-8 JSON (dmt-memory/v1) — or hash any text/file.
2. SHA-256 the exact bytes.
3. POST the raw 32-byte digest to public OpenTimestamps calendars.
4. Keep the memory + .ots receipt yourself (localStorage/Git/SQLite/S3/IPFS — your choice).
5. Upgrade & verify later (~1–3h) once calendars anchor into Bitcoin.

Proofs are free via OpenTimestamps. This site is static and stores nothing on a server.

### Honest scope
Proves: exact bytes existed no later than the Bitcoin block time.
Does not prove: who made it, ownership, originality, value, or any token rights.

Curious how HN folks think about using OTS this way for agent/audit trails vs. just “timestamp a PDF.” Sharp edges I should document more clearly (calendar trust assumptions, upgrade UX, header/CLI verification)?
```

---

## B) Soft Reddit — r/Bitcoin (build log, not a pitch)

**Title:**
```
Build log: wrapping OpenTimestamps for AI-agent memories (prove bytes-by-block-time, keep your own storage)
```

**Body:**
```
Build log / feedback ask — not selling anything.

I wanted agent memories that are independently checkable against Bitcoin time, without standing up a backend or asking anyone to trust my DB timestamps.

Flow:
- Canonicalize memory JSON (sorted keys, UTF-8)
- SHA-256 the exact bytes
- Stamp the raw 32-byte digest with public OpenTimestamps calendars
- Keep memory + .ots yourself; upgrade after calendars land in a block (~1–3h)

Static demo + verifier (site stores nothing): https://misty-flame-3nw3.here.now/
Agent-oriented recipe: https://misty-flame-3nw3.here.now/llms.txt

Honest scope: proves bytes existed by a Bitcoin block time. Does not prove authorship, ownership, or “this agent is trustworthy.”

Curious how Bitcoin folks think about using OTS this way for agent/audit trails vs. just timestamping a PDF. Any sharp edges I should document more clearly (calendar trust assumptions, upgrade UX, header/CLI verification)?
```

---

## C) Soft Reddit — r/AI_Agents (build log)

**Title:**
```
Build log: Bitcoin-timestamped memory receipts for agents (canonical JSON + OpenTimestamps, no backend)
```

**Body:**
```
Build log from a weekend-ish experiment.

Problem I kept hitting: agents accumulate “memories,” but later it’s hard to show that exact state existed by time T without trusting my own DB timestamps.

Approach:
- Canonicalize memory as sorted-key UTF-8 JSON (agent_id, key, content, tags, created_at)
- SHA-256 the exact bytes
- Stamp the raw 32-byte digest with public OpenTimestamps calendars
- Store memory + .ots wherever the agent already keeps state

Static UI + verifier (no signup, site stores nothing):
https://misty-flame-3nw3.here.now/

Agent-oriented recipe:
https://misty-flame-3nw3.here.now/llms.txt

Honest limits: proves bytes-by-Bitcoin-block-time, not authorship or “this agent is trustworthy.” Hosted encrypted store / managed API isn’t live yet; browser ledger is localStorage until you export.

If you’ve built agent memory layers — would you want this as a tiny library, an MCP tool, or just the protocol + examples?
```

---

## Directory status (checked 2026-11-05)

| Directory | Status |
|---|---|
| llmslist.com | LIVE — DMT Receipts listed (misty-flame-3nw3.here.now), readiness 65/100, link quality 0/25 |
| directory.llmstxt.cloud | Not found yet (waitlist / not indexed) |
| llmstxt.site | Not found yet |

## Highest leverage today
- Yorgi: paste & submit the Show HN draft (needs your HN account).
- Cultura without you: keep watching the other two directories, draft an llms.txt link-quality fix for the 0/25 score, prep reply drafts if threads get comments — without posting.
