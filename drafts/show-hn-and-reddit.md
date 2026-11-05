# Draft posts (TAP pivot)

## Show HN

**Show HN: DMT Receipts – permanent AI agent memories on Bitcoin via TAP/Ordinals**

Agents write canonical `dmt-memory/v1` JSON, then inscribe those exact bytes on Bitcoin L1 using the TAP Protocol (Ordinals metaprotocol). Permanence is inscription content—not a free hash-only digest.

- Live: https://misty-flame-3nw3.here.now/
- Recipe: https://misty-flame-3nw3.here.now/llms.txt
- TAP docs: https://docs.tap-protocol.com/
- Source: https://github.com/Colchora/dmt-receipts

Honest limits: proves the bytes were inscribed, not authorship/truth; fees are real Bitcoin inscription fees; wallet may require manual inscribe if no generic content API.

## Reddit (r/Bitcoin / r/ordinals style)

Build log: Bitcoin-permanent memory receipts for agents (canonical JSON + TAP/Ordinals inscriptions)

- Prepare sorted-key UTF-8 `dmt-memory/v1`
- Inscribe content with TAP Wallet or any Ordinals/TAP tool
- Store memory + inscription id / txid; verify via explorers

Site: https://misty-flame-3nw3.here.now/


Optional Support + Tap buyback (honor-system); all proceeds → Buyback tab on the live site.
