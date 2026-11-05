/**
 * Show-and-tell: prepare the fixed demo memory, then verify the digest.
 * Usage (from the repo root, after npm ci): node examples/run-demo.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const demoUrl = new URL("./demo-memory.json", import.meta.url);
const expectedUrl = new URL("./expected-digest.json", import.meta.url);
const memory = JSON.parse(readFileSync(demoUrl, "utf8"));
const expected = JSON.parse(readFileSync(expectedUrl, "utf8"));

let callTool;
try {
  ({ callTool } = await import("../dist/index.js"));
} catch (error) {
  const missing = error && typeof error === "object" && "code" in error && error.code === "ERR_MODULE_NOT_FOUND";
  if (missing) {
    console.error("dist/index.js is missing. From the repo root run: npm ci");
    process.exit(1);
  }
  throw error;
}

assert.deepEqual(
  Object.keys(memory).sort(),
  ["agent_id", "content", "created_at", "key", "tags"],
  "demo memory must stay the five published fields"
);

function parseTool(result, name) {
  if (result.isError) {
    throw new Error(`${name} failed: ${result.content[0]?.text ?? "unknown error"}`);
  }
  return JSON.parse(result.content[0].text);
}

const prepared = parseTool(await callTool("prepare_memory", memory), "prepare_memory");
assert.equal(prepared.status, expected.prepare.status);
assert.equal(prepared.sha256, expected.sha256);
assert.equal(prepared.byte_length, expected.byte_length);
assert.equal(prepared.canonical, expected.canonical);
assert.equal(prepared.inscription_recipe.content_utf8, expected.canonical);
assert.equal(prepared.inscription_recipe.optional_tap_dta, `sha256:${expected.sha256}`);

const verifyArgs = expected.verify_without_inscription;
const verified = parseTool(
  await callTool("verify_inscription", {
    memory: prepared.memory,
    sha256: expected.sha256,
    fetch_content: verifyArgs.fetch_content,
    include_trac: verifyArgs.include_trac,
  }),
  "verify_inscription"
);
assert.equal(verified.sha256, expected.sha256);
assert.equal(verified.matches_expected_sha256, verifyArgs.matches_expected_sha256);
assert.equal(verified.ok, verifyArgs.ok);
assert.equal(verified.content_fetch.attempted, false);
assert.equal(verified.explorer_links.length, 0);

const summary = {
  prepare_memory: {
    status: prepared.status,
    sha256: prepared.sha256,
    byte_length: prepared.byte_length,
    canonical: prepared.canonical,
  },
  verify_inscription: {
    ok: verified.ok,
    sha256: verified.sha256,
    matches_expected_sha256: verified.matches_expected_sha256,
    content_fetch: verified.content_fetch,
    note: verified.note,
  },
};
console.log(JSON.stringify(summary, null, 2));
