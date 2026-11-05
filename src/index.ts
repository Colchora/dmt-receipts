#!/usr/bin/env node
/**
 * DMT Receipts MCP server: stamp_memory and verify_receipt.
 * Protocol: https://misty-flame-3nw3.here.now/llms.txt
 */
import { createHash } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CALENDARS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://a.pool.eternitywall.com",
] as const;
const CALENDAR_TIMEOUT_MS = 10_000;

/** OpenTimestamps v1 magic header, followed by version and SHA-256 opcode. */
const OTS_MAGIC = Buffer.from(
  "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294",
  "hex"
);
const OTS_VERSION = 0x01;
const OTS_SHA256_OPCODE = 0x08;

export type MemoryV1 = {
  agent_id: string;
  key: string;
  content: unknown;
  tags: string[];
  created_at: string;
  [extension: string]: unknown;
};

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (char) => char.codePointAt(0)!);
  const b = Array.from(right, (char) => char.codePointAt(0)!);
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function stringifyPrimitive(value: string | number | boolean): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Value cannot be represented in JSON");
  return encoded;
}

function canonicalJson(value: unknown, path = "memory"): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return stringifyPrimitive(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} must not contain a non-finite number`);
    }
    return stringifyPrimitive(value);
  }
  if (Array.isArray(value)) {
    const items = Array.from(value, (item, index) => canonicalJson(item, `${path}[${index}]`));
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must contain only JSON-compatible objects`);
    }
    const entries = Object.keys(value).sort(compareCodePoints);
    const serialized = entries.map((key) => {
      const encodedKey = stringifyPrimitive(key);
      const encodedValue = canonicalJson(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`
      );
      return `${encodedKey}:${encodedValue}`;
    });
    return `{${serialized.join(",")}}`;
  }
  throw new Error(`${path} contains a value that cannot be represented in JSON`);
}

export function canonicalBytes(memory: MemoryV1): Buffer {
  return Buffer.from(canonicalJson(memory), "utf8");
}

export function sha256(bytes: Buffer): Buffer {
  return createHash("sha256").update(bytes).digest();
}

function utcNowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace(/\.\d{3}Z$/, "Z") === value;
}

function assertMemory(value: unknown): asserts value is MemoryV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("memory must be a dmt-memory/v1 object");
  }
  const memory = value as Record<string, unknown>;
  if (typeof memory.agent_id !== "string" || !memory.agent_id) {
    throw new Error("memory.agent_id must be a non-empty string");
  }
  if (typeof memory.key !== "string" || !memory.key) {
    throw new Error("memory.key must be a non-empty string");
  }
  const contentType = typeof memory.content;
  if (
    memory.content === null ||
    !["string", "object", "number", "boolean"].includes(contentType)
  ) {
    throw new Error("memory.content must be a JSON string, object, array, number, or boolean");
  }
  if (!Array.isArray(memory.tags) || !memory.tags.every((tag) => typeof tag === "string")) {
    throw new Error("memory.tags must be an array of strings");
  }
  if (typeof memory.created_at !== "string" || !isUtcTimestamp(memory.created_at)) {
    throw new Error("memory.created_at must be a valid ISO-8601 UTC timestamp ending in Z");
  }
  canonicalJson(memory);
}

type CalendarReply = { url: string; body?: Buffer; error?: string };

async function postDigest(calendar: string, digest: Buffer): Promise<CalendarReply> {
  try {
    const response = await fetch(`${calendar}/digest`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.opentimestamps.v1",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new Uint8Array(digest),
      signal: AbortSignal.timeout(CALENDAR_TIMEOUT_MS),
    });
    if (!response.ok) return { url: calendar, error: `HTTP ${response.status}` };
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0) return { url: calendar, error: "empty response" };
    return { url: calendar, body };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { url: calendar, error: reason };
  }
}

export async function stampMemory(args: {
  agent_id: string;
  key: string;
  content: unknown;
  tags?: string[];
  created_at?: string;
}): Promise<{
  memory: MemoryV1;
  canonical: string;
  sha256: string;
  calendars: string[];
  status: "pending";
  ots_base64: string;
}> {
  const memory: MemoryV1 = {
    agent_id: args.agent_id,
    content: args.content,
    created_at: args.created_at ?? utcNowIso(),
    key: args.key,
    tags: args.tags ?? [],
  };
  assertMemory(memory);

  const canonical = canonicalBytes(memory);
  const digest = sha256(canonical);
  const replies = await Promise.all(CALENDARS.map((calendar) => postDigest(calendar, digest)));
  const successful = replies.filter(
    (reply): reply is CalendarReply & { body: Buffer } => reply.body !== undefined
  );
  if (successful.length === 0) {
    const detail = replies.map(({ url, error }) => `${url}: ${error}`).join("; ");
    throw new Error(`All OpenTimestamps calendars failed (${detail})`);
  }

  // Fork-join calendar responses using the protocol's 0xff marker.
  const timestampBody = Buffer.concat(
    successful.flatMap(({ body }, index) =>
      index < successful.length - 1 ? [Buffer.from([0xff]), body] : [body]
    )
  );
  const ots = Buffer.concat([
    OTS_MAGIC,
    Buffer.from([OTS_VERSION, OTS_SHA256_OPCODE]),
    digest,
    timestampBody,
  ]);

  return {
    memory,
    canonical: canonical.toString("utf8"),
    sha256: digest.toString("hex"),
    calendars: successful.map(({ url }) => url),
    status: "pending",
    ots_base64: ots.toString("base64"),
  };
}

export function verifyReceiptLocal(args: {
  memory: MemoryV1;
  ots_base64: string;
  sha256?: string;
}): {
  ok: boolean;
  sha256: string;
  matches_digest: boolean;
  matches_ots_header: boolean;
  note: string;
} {
  assertMemory(args.memory);
  const canonical = canonicalBytes(args.memory);
  const digest = sha256(canonical);
  const hex = digest.toString("hex");
  const validBase64 =
    args.ots_base64.length > 0 &&
    args.ots_base64.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(args.ots_base64) &&
    Buffer.from(args.ots_base64, "base64").toString("base64") === args.ots_base64;
  const ots = validBase64 ? Buffer.from(args.ots_base64, "base64") : Buffer.alloc(0);
  const headerLength = OTS_MAGIC.length + 2 + digest.length;
  const headerOk =
    ots.length >= headerLength &&
    ots.subarray(0, OTS_MAGIC.length).equals(OTS_MAGIC) &&
    ots[OTS_MAGIC.length] === OTS_VERSION &&
    ots[OTS_MAGIC.length + 1] === OTS_SHA256_OPCODE;
  const digestInOts = headerOk && ots.subarray(OTS_MAGIC.length + 2, headerLength).equals(digest);
  const hexOk = !args.sha256 || args.sha256.toLowerCase() === hex;
  const ok = headerOk && digestInOts && hexOk;

  return {
    ok,
    sha256: hex,
    matches_digest: digestInOts && hexOk,
    matches_ots_header: headerOk,
    note: ok
      ? "Local digest match only. For Bitcoin-anchored proof, run: ots upgrade receipt.ots && ots verify -f memory.json receipt.ots"
      : "Local check failed: canonical bytes do not match a valid .ots header and digest.",
  };
}

const server = new Server(
  { name: "dmt-receipts", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "stamp_memory",
      description:
        "Canonicalize a dmt-memory/v1 JSON memory, SHA-256 it, stamp the digest on public OpenTimestamps calendars, and return the memory plus a base64 .ots receipt. Proves the exact bytes existed no later than a Bitcoin block time; does not prove authorship. Stores nothing.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Stable agent identifier" },
          key: { type: "string", description: "Memory key / slug / path" },
          content: {
            description: "Memory payload (string, object, array, number, or boolean)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional string tags; defaults to []",
          },
          created_at: {
            type: "string",
            description: "Optional ISO-8601 UTC timestamp ending in Z; defaults to now",
          },
        },
        required: ["agent_id", "key", "content"],
      },
    },
    {
      name: "verify_receipt",
      description:
        "Locally check that a base64 OpenTimestamps receipt header and digest match a dmt-memory/v1 object's canonical SHA-256. Does not validate calendar operations or Bitcoin inclusion; use ots upgrade/verify for full proof verification.",
      inputSchema: {
        type: "object",
        properties: {
          memory: {
            type: "object",
            description: "Full dmt-memory/v1 object (agent_id, key, content, tags, created_at)",
          },
          ots_base64: { type: "string", description: "Base64-encoded .ots receipt" },
          sha256: {
            type: "string",
            description: "Optional expected hex digest to cross-check",
          },
        },
        required: ["memory", "ots_base64"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  try {
    if (name === "stamp_memory") {
      if (typeof args.agent_id !== "string") throw new Error("agent_id must be a string");
      if (typeof args.key !== "string") throw new Error("key must be a string");
      if (
        args.tags !== undefined &&
        (!Array.isArray(args.tags) || !args.tags.every((tag) => typeof tag === "string"))
      ) {
        throw new Error("tags must be an array of strings");
      }
      if (args.created_at !== undefined && typeof args.created_at !== "string") {
        throw new Error("created_at must be a string");
      }
      const result = await stampMemory({
        agent_id: args.agent_id,
        key: args.key,
        content: args.content,
        tags: args.tags as string[] | undefined,
        created_at: args.created_at as string | undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "verify_receipt") {
      if (typeof args.ots_base64 !== "string") throw new Error("ots_base64 must be a string");
      if (args.sha256 !== undefined && typeof args.sha256 !== "string") {
        throw new Error("sha256 must be a string");
      }
      const result = verifyReceiptLocal({
        memory: args.memory as MemoryV1,
        ots_base64: args.ots_base64,
        sha256: args.sha256 as string | undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
