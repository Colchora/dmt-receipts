import assert from "node:assert/strict";
import test from "node:test";
import { verifyInscription, fetchTracMetadata, canonicalBytes, sha256 } from "../dist/index.js";

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

test("fetchTracMetadata rejects credentialed rest base", async () => {
  const result = await fetchTracMetadata({
    inscription_id: "0".repeat(64) + "i0",
    trac_rest_base: "http://user:pass@127.0.0.1:5099",
  });
  assert.equal(result.ok, false);
  assert.match(result.error || "", /credentials|trac_rest_base/i);
});
