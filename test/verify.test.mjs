import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyInscription,
  fetchTracMetadata,
  canonicalBytes,
  sha256,
  callTool,
} from "../dist/index.js";

const memory = {
  agent_id: "test-agent",
  key: "notes/unit",
  content: "hello trac",
  tags: ["test"],
  created_at: "2026-01-01T00:00:00Z",
};

test("verify_inscription without inscription skips trac", async () => {
  const result = await verifyInscription({ memory, include_trac: true, fetch_content: false });
  assert.equal(result.matches_expected_sha256, true);
  assert.equal(result.trac, undefined);
  assert.equal(result.sha256.length, 64);
});

test("verify_inscription include_trac false omits trac even with id", async () => {
  const result = await verifyInscription({
    memory,
    inscription_id: "0".repeat(64) + "i0",
    include_trac: false,
    fetch_content: false,
  });
  assert.equal(result.trac, undefined);
});

test("verify_inscription include_trac soft-fails when Trac unreachable", async () => {
  const result = await verifyInscription({
    memory,
    inscription_id: "0".repeat(64) + "i0",
    include_trac: true,
    fetch_content: false,
    trac_rest_base: "http://127.0.0.1:9",
  });
  assert.ok(result.trac);
  assert.equal(typeof result.trac.ok, "boolean");
  // Soft-fail: tool still returns a normal verify payload
  assert.equal(result.matches_expected_sha256, true);
  assert.equal(result.sha256, sha256(canonicalBytes(memory)).toString("hex"));
});

test("verify_inscription rejects a non-boolean fetch_content before any network call", async () => {
  await assert.rejects(
    () => verifyInscription({ memory, fetch_content: "false" }),
    /fetch_content must be a boolean/
  );
  const result = await callTool("verify_inscription", { memory, fetch_content: "false" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /fetch_content must be a boolean/);
});

test("prepare_memory keeps extension fields in the canonical hash", async () => {
  const result = await callTool("prepare_memory", {
    agent_id: "n",
    key: "n",
    content: "c",
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    apple: "x",
    zebra: 1,
  });
  assert.equal(result.isError, undefined);
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.memory.agent_id, "n");
  assert.equal(body.memory.apple, "x");
  assert.equal(body.memory.zebra, 1);
  assert.equal(
    body.sha256,
    "74f4d5e687fb869e5e3e4d8e2995deffae79e56ce21a57dc73136bfb4036c782"
  );
  assert.equal(body.canonical, canonicalBytes(body.memory).toString("utf8"));
});

test("fetchTracMetadata rejects credentialed rest base", async () => {
  const result = await fetchTracMetadata({
    inscription_id: "0".repeat(64) + "i0",
    trac_rest_base: "http://user:pass@127.0.0.1:5099",
  });
  assert.equal(result.ok, false);
  assert.match(result.error || "", /credentials|trac_rest_base/i);
});
