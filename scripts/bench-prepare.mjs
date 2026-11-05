/**
 * Local timing for prepare_memory. Not a CI gate — run after `npm run build`.
 * Usage: node scripts/bench-prepare.mjs
 */
import { prepareMemory } from "../dist/index.js";

function bigMemory(keys, strLen) {
  const content = {};
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  for (let i = 0; i < keys; i += 1) {
    const key = `k${alphabet[i % 26]}${i.toString(16)}_\u00e9`;
    content[key] =
      i % 17 === 0 ? { n: i, ok: i % 2 === 0, tags: ["a", "b", "c".repeat(8)] } : "v".repeat(strLen);
  }
  return {
    agent_id: "bench-agent",
    key: "bench/large",
    content,
    tags: ["bench", "perf", "canonical"],
    created_at: "2026-11-05T17:00:00Z",
  };
}

const small = {
  agent_id: "demo-agent",
  key: "prefs/style",
  content: "User prefers concise diffs and UTC-5 timestamps.",
  tags: ["preferences", "ui"],
  created_at: "2026-11-05T19:00:00Z",
};
const large = bigMemory(400, 200);
const huge = {
  agent_id: "bench-agent",
  key: "bench/text",
  content: "Remember this exact state. ".repeat(20_000),
  tags: ["demo"],
  created_at: "2026-11-05T17:00:00Z",
};

function time(label, fn, iters) {
  for (let i = 0; i < 20; i += 1) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iters; i += 1) fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`${label}: ${ms.toFixed(1)} ms / ${iters} = ${(ms / iters).toFixed(4)} ms/op`);
}

const prepared = prepareMemory(small);
if (prepared.sha256 !== "76f3f9ff531cecbfe46e676e932f9b0d9d02b3d7c04e5a558924a8092cb0294b") {
  throw new Error(`demo digest drifted: ${prepared.sha256}`);
}

time("small prepare", () => prepareMemory(small), 5000);
time("large prepare 400 keys", () => prepareMemory(large), 200);
time("huge string prepare", () => prepareMemory(huge), 200);
