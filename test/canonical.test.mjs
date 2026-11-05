import assert from "node:assert/strict";
import test from "node:test";
import { canonicalBytes, isCliEntry, prepareMemory, sha256 } from "../dist/index.js";

const DEMO_CANONICAL =
  '{"agent_id":"demo-agent","content":"User prefers concise diffs and UTC-5 timestamps.","created_at":"2026-11-05T19:00:00Z","key":"prefs/style","tags":["preferences","ui"]}';
const DEMO_SHA = "76f3f9ff531cecbfe46e676e932f9b0d9d02b3d7c04e5a558924a8092cb0294b";

function digest(memory) {
  const bytes = canonicalBytes(memory);
  return { canonical: bytes.toString("utf8"), sha256: sha256(bytes).toString("hex"), bytes: bytes.length };
}

test("published demo memory keeps its canonical bytes and sha256", () => {
  const prepared = prepareMemory({
    agent_id: "demo-agent",
    key: "prefs/style",
    content: "User prefers concise diffs and UTC-5 timestamps.",
    tags: ["preferences", "ui"],
    created_at: "2026-11-05T19:00:00Z",
  });
  assert.equal(prepared.canonical, DEMO_CANONICAL);
  assert.equal(prepared.inscription_recipe.content_utf8, DEMO_CANONICAL);
  assert.equal(prepared.sha256, DEMO_SHA);
  assert.equal(prepared.byte_length, 170);
  assert.equal(prepared.inscription_recipe.optional_tap_dta, `sha256:${DEMO_SHA}`);
});

test("readme example canonicalizes to sorted compact utf-8", () => {
  const { canonical, sha256: hex } = digest({
    agent_id: "demo-agent",
    key: "notes/hello",
    content: "Remember this exact state.",
    tags: ["demo"],
    created_at: "2026-11-05T17:00:00Z",
  });
  assert.equal(
    canonical,
    '{"agent_id":"demo-agent","content":"Remember this exact state.","created_at":"2026-11-05T17:00:00Z","key":"notes/hello","tags":["demo"]}'
  );
  assert.equal(hex, "e8fb99128863e500de1b71a915d30d9f9863ebeebd8381f2d45cb34502fc8cdb");
});

test("object keys sort by unicode code point, including supplementary characters", () => {
  const { canonical, sha256: hex } = digest({
    agent_id: "a",
    key: "k",
    content: { "\uE000": 1, "\u{10000}": 2, b: 3, a: 4, é: 5, "\u{1F600}": 6, A: 7 },
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
  });
  const content = canonical.slice(canonical.indexOf('"content":'));
  assert.ok(content.indexOf('"\uE000"') < content.indexOf('"\u{10000}"'));
  assert.ok(content.indexOf('"A":') < content.indexOf('"a":'));
  assert.equal(hex, "4d2e4c35acdc7eb1e73bc28170876e0b939fac616ba8c4d1b765bc6ae8fbb54f");
});

test("string escaping matches JSON.stringify, including lone surrogates", () => {
  const escapes = digest({
    agent_id: 'a"b\\c',
    key: "line\n\t\r",
    content: "quote \" slash \\ u2028\u2028u2029\u2029 null\u0000 end",
    tags: ["\u0001"],
    created_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(escapes.sha256, "c49e78c284a3f51c9b0a01f5badce4489979cde85205753a5c4e231616e0bd8b");
  assert.ok(escapes.canonical.includes("\u2028"));
  assert.match(escapes.canonical, /\\u0000/);

  const lone = digest({
    agent_id: "a",
    key: "k",
    content: "lone\uD800surrogate",
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(lone.sha256, "79d05936c59766631b27d1fc4c46ecb103ed30a043dbfbf7f007f7abef7ecb6e");
});

test("nested values, numbers, and emoji keys keep locked digests", () => {
  assert.equal(
    digest({
      agent_id: "n",
      key: "n",
      content: { i: 0, neg: -0, f: 1.5, big: 1e21, small: 1e-7, arr: [true, false, null, 42] },
      tags: [],
      created_at: "2026-01-01T00:00:00Z",
    }).sha256,
    "ce4d280f457b892e58c1cd552cdf0ea955b0e2693f3a92ba0010341d63cc9683"
  );
  assert.equal(
    digest({
      agent_id: "n",
      key: "n",
      content: [{ z: 1, a: { m: 1, b: 2 } }, "x"],
      tags: ["t"],
      created_at: "2026-01-01T00:00:00Z",
    }).sha256,
    "e986a630d4400fdb6a8cb17e3111142344eb67b91f1ba2b56da3e98be5b6e09d"
  );
  assert.equal(
    digest({
      agent_id: "id",
      key: "key",
      content: { "👨‍👩‍👧‍👦": "family", é: "e", "\u{10000}": "supp", "\uE000": "pua" },
      tags: ["🏷️"],
      created_at: "2026-01-01T00:00:00Z",
    }).sha256,
    "484480acac42056393fd4a45d31c3573f6649a451a0b32d46ccb66013a4d0189"
  );
});

test("canonical errors name the path of the bad value", () => {
  assert.throws(
    () =>
      prepareMemory({
        agent_id: "a",
        key: "k",
        content: { bad: Infinity },
        created_at: "2026-01-01T00:00:00Z",
      }),
    /memory\.content\.bad must not contain a non-finite number/
  );
  assert.throws(
    () =>
      prepareMemory({
        agent_id: "a",
        key: "k",
        content: [Infinity],
        created_at: "2026-01-01T00:00:00Z",
      }),
    /memory\.content\[0\] must not contain a non-finite number/
  );
  assert.throws(
    () =>
      prepareMemory({
        agent_id: "a",
        key: "k",
        content: { bad: undefined },
        created_at: "2026-01-01T00:00:00Z",
      }),
    /memory\.content\.bad contains a value that cannot be represented in JSON/
  );
});

test("prepareMemory does not let extensions overwrite required fields", () => {
  const prepared = prepareMemory({
    agent_id: "n",
    key: "n",
    content: "c",
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    extensions: { agent_id: "other", apple: "x" },
  });
  assert.equal(prepared.memory.agent_id, "n");
  assert.equal(prepared.memory.apple, "x");
  assert.equal(prepared.sha256, sha256(canonicalBytes(prepared.memory)).toString("hex"));
});

test("cli entry recognizes windows paths, relative paths, and the npm bin name", () => {
  assert.equal(isCliEntry("C:\\app\\dist\\index.js"), true);
  assert.equal(isCliEntry("dist/index.js"), true);
  assert.equal(isCliEntry("index.js"), true);
  assert.equal(isCliEntry("/usr/local/bin/dmt-receipts-mcp"), true);
  assert.equal(isCliEntry("/tmp/verify.test.mjs"), false);
  assert.equal(isCliEntry(undefined), false);
});
