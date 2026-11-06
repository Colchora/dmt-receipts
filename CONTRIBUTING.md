# Contributing

Keep changes focused and aligned with the published protocol:

- https://misty-flame-3nw3.here.now/spec.md
- https://misty-flame-3nw3.here.now/llms.txt

Preserve canonical sorted-key UTF-8 JSON (Unicode code point order, compact separators, no trailing newline), honest verification scope, and both MCP tool names: `prepare_memory` and `verify_inscription`. Permanence is the inscribed bytes, not a calendar digest.

With Node.js 18 or later:

```sh
npm ci
npm run typecheck
npm test
```

`npm run typecheck` runs `tsc --noEmit`. `npm test` rebuilds `dist/`, runs the unit tests, and runs `examples/run-demo.mjs`. That demo locks the published digest in `examples/expected-digest.json`. Include or update tests when behavior changes. Never include private memory content, credentials, or generated `node_modules` in a contribution.
