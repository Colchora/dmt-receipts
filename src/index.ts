#!/usr/bin/env node
/**
 * DMT Receipts MCP server: prepare_memory and verify_inscription.
 * Protocol: https://misty-flame-3nw3.here.now/llms.txt
 * Permanence: Bitcoin TAP Protocol / Ordinals inscriptions (not calendar digests).
 */
import { createHash } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TAP_DOCS = "https://docs.tap-protocol.com/";
const TAP_SPECS = "https://github.com/Trac-Systems/tap-protocol-specs";
const ORD_CONTENT = (id: string) => `https://ordinals.com/content/${encodeURIComponent(id)}`;
const ORD_INSCRIPTION = (id: string) =>
  `https://ordinals.com/inscription/${encodeURIComponent(id)}`;
const MEMPOOL_TX = (txid: string) => `https://mempool.space/tx/${encodeURIComponent(txid)}`;
const FETCH_TIMEOUT_MS = 15_000;

const TRAC_WS_URL = "https://tap.trac.network";
const TRAC_TIMEOUT_MS = 8_000;
const PREPARE_KNOWN_FIELDS = new Set(["agent_id", "key", "content", "tags", "created_at"]);

export type TracLookupResult = {
  ok: boolean;
  source?: string;
  deployment_tap?: unknown;
  dmt_mint_holder?: unknown;
  transfer_amount?: unknown;
  accumulator?: unknown;
  error?: string;
};

type TracField = keyof Omit<TracLookupResult, "ok" | "source" | "error">;

type TracQuery = {
  key: TracField;
  restFunc: string;
  wsFunc: string;
  callArgs: Array<string | number>;
};

type TracCallOutcome = {
  ok: boolean;
  result?: unknown;
  error?: string;
  source: string;
};

type ContentFetch = {
  attempted: boolean;
  ok: boolean;
  matches_canonical: boolean;
  remote_sha256?: string;
  error?: string;
};

export type PrepareMemoryInput = {
  agent_id: string;
  key: string;
  content: unknown;
  tags?: string[];
  created_at?: string;
  extensions?: Record<string, unknown>;
};

export type VerifyInscriptionInput = {
  memory: MemoryV1;
  inscription_id?: string;
  txid?: string;
  sha256?: string;
  fetch_content?: boolean;
  include_trac?: boolean;
  trac_rest_base?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toolArgs(raw: unknown): Record<string, unknown> {
  if (isRecord(raw) && !Array.isArray(raw)) return raw;
  return {};
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
  message: string
): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(message);
  return value;
}

function optionalBoolean(
  args: Record<string, unknown>,
  key: string,
  message: string
): boolean | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(message);
  return value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string");
}

function optionalStringArray(
  args: Record<string, unknown>,
  key: string,
  message: string
): string[] | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!isStringArray(value)) throw new Error(message);
  return value;
}

function normalizeTracRestBase(raw: string | undefined): string {
  const value = (raw || "").trim();
  if (!value) return "";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("trac_rest_base must be http(s)");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("trac_rest_base must not include credentials, query, or fragment");
  }
  return url.href.replace(/\/+$/, "");
}

function unwrapTracPayload(msg: unknown): unknown {
  if (isRecord(msg)) {
    const errorValue = msg.error;
    if (errorValue) {
      throw new Error(typeof errorValue === "string" ? errorValue : JSON.stringify(errorValue));
    }
    if (Object.prototype.hasOwnProperty.call(msg, "result")) return msg.result;
  }
  if (msg === undefined) throw new Error("No result returned");
  return msg;
}

async function tracRestGet(
  base: string,
  func: string,
  args: Array<string | number> = []
): Promise<TracCallOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRAC_TIMEOUT_MS);
  timer.unref();
  try {
    const path =
      args.length === 0
        ? `${base}/${func}`
        : `${base}/${func}/${args.map((part) => encodeURIComponent(String(part))).join("/")}`;
    const response = await fetch(path, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = unwrapTracPayload(await response.json());
    return { ok: true, result, source: "self-hosted REST" };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "REST lookup timed out"
          : error.message
        : String(error);
    return { ok: false, error: message, source: "self-hosted REST" };
  } finally {
    clearTimeout(timer);
  }
}

async function tracSocketGetMany(
  calls: Array<{ func: string; args: Array<string | number> }>
): Promise<TracCallOutcome[]> {
  if (calls.length === 0) return [];
  let ioFactory: typeof import("socket.io-client").io;
  try {
    ({ io: ioFactory } = await import("socket.io-client"));
  } catch (error) {
    const message =
      error instanceof Error
        ? `socket.io-client unavailable: ${error.message}`
        : "socket.io-client unavailable";
    return calls.map(() => ({ ok: false, error: message, source: "public WS" }));
  }

  return new Promise((resolve) => {
    const results = new Array<TracCallOutcome | undefined>(calls.length);
    let remaining = calls.length;
    let settled = false;
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const pending = calls.map((call, index) => ({
      func: call.func,
      args: call.args,
      callId: `dmt-mcp-${nonce}-${index.toString(36)}`,
    }));
    const indexById = new Map<string, number>();
    for (const [index, entry] of pending.entries()) indexById.set(entry.callId, index);

    const socket = ioFactory(TRAC_WS_URL, {
      autoConnect: false,
      reconnection: false,
      timeout: TRAC_TIMEOUT_MS,
      forceNew: true,
      transports: ["websocket"],
    });

    const timer = setTimeout(() => {
      for (let i = 0; i < calls.length; i += 1) {
        if (!results[i]) {
          finishOne(i, { ok: false, error: `Lookup timed out after ${TRAC_TIMEOUT_MS} ms` });
        }
      }
    }, TRAC_TIMEOUT_MS);
    timer.unref();

    const closeSocket = () => {
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        try {
          socket.disconnect();
        } catch {
          /* ignore */
        }
      }
    };

    const finishAll = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeSocket();
      resolve(
        results.map(
          (result) => result ?? { ok: false, error: "Connection closed", source: "public WS" }
        )
      );
    };

    const finishOne = (
      index: number,
      value: { ok: boolean; result?: unknown; error?: string }
    ) => {
      if (results[index]) return;
      results[index] = { ...value, source: "public WS" };
      remaining -= 1;
      if (remaining === 0) finishAll();
    };

    const failOpen = (message: string) => {
      for (let i = 0; i < calls.length; i += 1) finishOne(i, { ok: false, error: message });
    };

    socket.on("response", (msg: unknown) => {
      if (!isRecord(msg)) return;
      const callId = msg.call_id;
      if (typeof callId !== "string") return;
      const index = indexById.get(callId);
      if (index === undefined) return;
      try {
        if (!Object.prototype.hasOwnProperty.call(msg, "result")) {
          const errorValue = msg.error;
          throw new Error(typeof errorValue === "string" ? errorValue : "Malformed Trac response");
        }
        finishOne(index, { ok: true, result: unwrapTracPayload(msg) });
      } catch (error) {
        finishOne(index, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    socket.on("connect_error", (err: Error) => {
      failOpen(err?.message || "Connection failed");
    });
    socket.on("disconnect", () => {
      for (let i = 0; i < calls.length; i += 1) {
        if (!results[i]) finishOne(i, { ok: false, error: "Connection closed" });
      }
    });
    socket.on("connect", () => {
      try {
        for (const entry of pending) {
          socket.emit("get", {
            func: entry.func,
            args: entry.args,
            call_id: entry.callId,
          });
        }
      } catch (error) {
        failOpen(error instanceof Error ? error.message : String(error));
      }
    });

    try {
      socket.connect();
    } catch (error) {
      failOpen(error instanceof Error ? error.message : String(error));
    }
  });
}

function tracQueries(inscriptionId: string): TracQuery[] {
  return [
    { key: "deployment_tap", restFunc: "getDeployment", wsFunc: "deployment", callArgs: ["tap"] },
    {
      key: "dmt_mint_holder",
      restFunc: "getDmtMintHolder",
      wsFunc: "dmtMintHolder",
      callArgs: [inscriptionId],
    },
    {
      key: "transfer_amount",
      restFunc: "getTransferAmountByInscription",
      wsFunc: "transferAmountByInscription",
      callArgs: [inscriptionId],
    },
    {
      key: "accumulator",
      restFunc: "getAccumulator",
      wsFunc: "accumulator",
      callArgs: [inscriptionId],
    },
  ];
}

function tracResultFromOutcomes(
  queries: TracQuery[],
  outcomes: TracCallOutcome[]
): TracLookupResult {
  const out: TracLookupResult = { ok: false };
  const errors: string[] = [];
  if (queries.length !== outcomes.length) {
    errors.push("Trac lookup count mismatch");
  }
  const count = queries.length < outcomes.length ? queries.length : outcomes.length;
  for (let i = 0; i < count; i += 1) {
    const query = queries[i];
    const result = outcomes[i];
    if (query === undefined || result === undefined) {
      errors.push(`lookup ${i}: missing result`);
      continue;
    }
    if (result.ok) {
      out.ok = true;
      if (!out.source) out.source = result.source;
      out[query.key] = result.result;
    } else if (result.error) {
      errors.push(`${query.key}: ${result.error}`);
    }
  }
  if (!out.ok) {
    out.error =
      errors.join("; ") ||
      "Trac index unreachable (public endpoint may be down; set DMT_TRAC_REST / trac_rest_base for self-hosted tap-reader)";
  } else if (errors.length) {
    out.error = `Partial Trac results; some lookups failed: ${errors.join("; ")}`;
  }
  return out;
}

export async function fetchTracMetadata(args: {
  inscription_id: string;
  trac_rest_base?: string;
}): Promise<TracLookupResult> {
  let restBase = "";
  try {
    restBase = normalizeTracRestBase(
      args.trac_rest_base !== undefined ? args.trac_rest_base : process.env.DMT_TRAC_REST
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const queries = tracQueries(args.inscription_id);
  try {
    // Public Trac is one Socket.IO session. Opening a connection per lookup
    // repeated the handshake four times on every verify.
    const outcomes = restBase
      ? await Promise.all(
          queries.map((query) => tracRestGet(restBase, query.restFunc, query.callArgs))
        )
      : await tracSocketGetMany(
          queries.map((query) => ({ func: query.wsFunc, args: query.callArgs }))
        );
    return tracResultFromOutcomes(queries, outcomes);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type MemoryV1 = {
  agent_id: string;
  key: string;
  content: unknown;
  tags: string[];
  created_at: string;
  [extension: string]: unknown;
};

function pathOf(segments: Array<string | number>): string {
  let path = "memory";
  for (const segment of segments) {
    path += typeof segment === "number" ? `[${segment}]` : `.${segment}`;
  }
  return path;
}

function compareCodePointsFrom(left: string, right: string, start: number): number {
  let i = start;
  let j = start;
  while (i < left.length && j < right.length) {
    const a = left.codePointAt(i);
    const b = right.codePointAt(j);
    if (a === undefined || b === undefined) break;
    if (a !== b) return a - b;
    i += a > 0xffff ? 2 : 1;
    j += b > 0xffff ? 2 : 1;
  }
  if (i >= left.length && j >= right.length) return 0;
  return i >= left.length ? -1 : 1;
}

function compareCodePoints(left: string, right: string): number {
  if (left === right) return 0;
  const limit = left.length < right.length ? left.length : right.length;
  for (let i = 0; i < limit; i += 1) {
    const a = left.charCodeAt(i);
    const b = right.charCodeAt(i);
    if (a === b && a < 0xd800) continue;
    if ((a >= 0xd800 && a <= 0xdfff) || (b >= 0xd800 && b <= 0xdfff)) {
      return compareCodePointsFrom(left, right, i);
    }
    if (a !== b) return a - b;
  }
  return left.length - right.length;
}

function writeCanonical(value: unknown, segments: Array<string | number>): string {
  if (value === null) return "null";
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") {
    return JSON.stringify(value);
  }
  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${pathOf(segments)} must not contain a non-finite number`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = new Array<string>(value.length);
    for (let i = 0; i < value.length; i += 1) {
      segments.push(i);
      items[i] = writeCanonical(value[i], segments);
      segments.pop();
    }
    return `[${items.join(",")}]`;
  }
  if (valueType === "object") {
    if (!isRecord(value)) {
      throw new Error(`${pathOf(segments)} contains a value that cannot be represented in JSON`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${pathOf(segments)} must contain only JSON-compatible objects`);
    }
    const keys = Object.keys(value).sort(compareCodePoints);
    const parts = new Array<string>(keys.length);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === undefined) {
        throw new Error(`${pathOf(segments)} contains a value that cannot be represented in JSON`);
      }
      segments.push(key);
      const encodedValue = writeCanonical(value[key], segments);
      segments.pop();
      parts[i] = `${JSON.stringify(key)}:${encodedValue}`;
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(`${pathOf(segments)} contains a value that cannot be represented in JSON`);
}

function canonicalJson(value: unknown): string {
  return writeCanonical(value, []);
}

export function canonicalBytes(memory: MemoryV1): Buffer {
  return Buffer.from(canonicalJson(memory), "utf8");
}

export function sha256(bytes: Buffer): Buffer {
  return createHash("sha256").update(bytes).digest();
}

function sha256Hex(data: string | Buffer): string {
  const hash = createHash("sha256");
  if (typeof data === "string") hash.update(data, "utf8");
  else hash.update(data);
  return hash.digest("hex");
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
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error("memory must be a dmt-memory/v1 object");
  }
  const agentId = value.agent_id;
  if (typeof agentId !== "string" || !agentId) {
    throw new Error("memory.agent_id must be a non-empty string");
  }
  const key = value.key;
  if (typeof key !== "string" || !key) {
    throw new Error("memory.key must be a non-empty string");
  }
  const content = value.content;
  const contentType = typeof content;
  if (content === null || !["string", "object", "number", "boolean"].includes(contentType)) {
    throw new Error("memory.content must be a JSON string, object, array, number, or boolean");
  }
  const tags = value.tags;
  if (!isStringArray(tags)) {
    throw new Error("memory.tags must be an array of strings");
  }
  const createdAt = value.created_at;
  if (typeof createdAt !== "string" || !isUtcTimestamp(createdAt)) {
    throw new Error("memory.created_at must be a valid ISO-8601 UTC timestamp ending in Z");
  }
}

function assignExtensions(memory: MemoryV1, extensions: Record<string, unknown> | undefined): void {
  if (!extensions) return;
  for (const key of Object.keys(extensions)) {
    if (PREPARE_KNOWN_FIELDS.has(key)) continue;
    Object.defineProperty(memory, key, {
      value: extensions[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
}

function extensionFields(
  args: Record<string, unknown>
): Record<string, unknown> | undefined {
  let extensions: Record<string, unknown> | undefined;
  for (const key of Object.keys(args)) {
    if (PREPARE_KNOWN_FIELDS.has(key)) continue;
    if (!extensions) extensions = {};
    extensions[key] = args[key];
  }
  return extensions;
}

export function prepareMemory(args: PrepareMemoryInput): {
  memory: MemoryV1;
  canonical: string;
  sha256: string;
  byte_length: number;
  status: "prepared";
  inscription_recipe: {
    content_type: string;
    content_utf8: string;
    optional_tap_dta: string;
    optional_tap_op_example: Record<string, string>;
    tap_docs: string;
    tap_specs: string;
    note: string;
  };
} {
  const memory: MemoryV1 = {
    agent_id: args.agent_id,
    content: args.content,
    created_at: args.created_at ?? utcNowIso(),
    key: args.key,
    tags: args.tags ?? [],
  };
  assignExtensions(memory, args.extensions);
  assertMemory(memory);

  const canonical = canonicalJson(memory);
  const hex = sha256Hex(canonical);
  const dta = `sha256:${hex}`.slice(0, 512);

  return {
    memory,
    canonical,
    sha256: hex,
    byte_length: Buffer.byteLength(canonical, "utf8"),
    status: "prepared",
    inscription_recipe: {
      content_type: "application/json",
      content_utf8: canonical,
      optional_tap_dta: dta,
      optional_tap_op_example: {
        p: "tap",
        op: "token-deploy",
        tick: "example",
        max: "1",
        lim: "1",
        dec: "0",
        dta,
      },
      tap_docs: TAP_DOCS,
      tap_specs: TAP_SPECS,
      note:
        "Inscribe content_utf8 as Ordinals content (application/json or text/plain). This MCP tool does not broadcast Bitcoin transactions or pay fees. optional_tap_op_example is only for token-deploy flows that carry dta (≤512 bytes); it does not replace content inscription for full memories.",
    },
  };
}

function emptyContentFetch(): ContentFetch {
  return {
    attempted: false,
    ok: false,
    matches_canonical: false,
  };
}

async function fetchInscriptionContent(
  inscriptionId: string,
  canonical: string,
  hex: string
): Promise<ContentFetch> {
  const contentFetch = emptyContentFetch();
  contentFetch.attempted = true;
  try {
    const response = await fetch(ORD_CONTENT(inscriptionId), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      contentFetch.error = `HTTP ${response.status}`;
    } else {
      const remote = Buffer.from(await response.arrayBuffer());
      contentFetch.ok = true;
      contentFetch.remote_sha256 = sha256Hex(remote);
      contentFetch.matches_canonical =
        remote.equals(Buffer.from(canonical, "utf8")) || contentFetch.remote_sha256 === hex;
    }
  } catch (error) {
    contentFetch.error = error instanceof Error ? error.message : String(error);
  }
  return contentFetch;
}

function tracLookupArgs(
  inscriptionId: string,
  tracRestBase: string | undefined
): { inscription_id: string; trac_rest_base?: string } {
  if (tracRestBase === undefined) return { inscription_id: inscriptionId };
  return { inscription_id: inscriptionId, trac_rest_base: tracRestBase };
}

export async function verifyInscription(args: VerifyInscriptionInput): Promise<{
  ok: boolean;
  sha256: string;
  byte_length: number;
  matches_expected_sha256: boolean;
  content_fetch: ContentFetch;
  explorer_links: string[];
  note: string;
  trac?: TracLookupResult;
}> {
  if (args.fetch_content !== undefined && typeof args.fetch_content !== "boolean") {
    throw new Error("fetch_content must be a boolean");
  }
  assertMemory(args.memory);
  const canonical = canonicalJson(args.memory);
  const hex = sha256Hex(canonical);
  const hexOk = !args.sha256 || args.sha256.toLowerCase() === hex;

  const inscriptionId = args.inscription_id ? args.inscription_id : undefined;
  const txid = args.txid ? args.txid : undefined;
  const links: string[] = [];
  if (inscriptionId) {
    links.push(ORD_INSCRIPTION(inscriptionId));
    links.push(ORD_CONTENT(inscriptionId));
  }
  if (txid) links.push(MEMPOOL_TX(txid));

  const shouldFetch = args.fetch_content !== false && inscriptionId !== undefined;
  const includeTrac = args.include_trac !== false && inscriptionId !== undefined;
  const contentFetchPromise =
    shouldFetch && inscriptionId !== undefined
      ? fetchInscriptionContent(inscriptionId, canonical, hex)
      : Promise.resolve(emptyContentFetch());
  const tracPromise =
    includeTrac && inscriptionId !== undefined
      ? fetchTracMetadata(tracLookupArgs(inscriptionId, args.trac_rest_base))
      : Promise.resolve(undefined);
  const [contentFetch, trac] = await Promise.all([contentFetchPromise, tracPromise]);

  const ok =
    hexOk &&
    (!contentFetch.attempted || contentFetch.matches_canonical) &&
    Boolean(args.inscription_id || args.txid || contentFetch.matches_canonical);

  let note: string;
  if (contentFetch.matches_canonical) {
    note =
      "Inscription content matches canonical memory bytes. Confirm explorer/TAP indexer links for human review.";
  } else if (!args.inscription_id && !args.txid) {
    note =
      "Local canonical hash only. Provide inscription_id (preferred) or txid, then re-run with fetch_content true.";
  } else if (contentFetch.attempted && !contentFetch.matches_canonical) {
    note =
      "Could not confirm content match via ordinals.com fetch. Open explorer_links and compare bytes manually. Fees/indexing are outside this tool.";
  } else {
    note =
      "Prepared local digest is consistent. On-chain permanence requires a confirmed Ordinals inscription whose content equals the canonical UTF-8 JSON.";
  }

  return {
    ok: Boolean(ok && hexOk && (contentFetch.matches_canonical || !contentFetch.attempted)),
    sha256: hex,
    byte_length: Buffer.byteLength(canonical, "utf8"),
    matches_expected_sha256: hexOk,
    content_fetch: contentFetch,
    explorer_links: links,
    note,
    ...(trac ? { trac } : {}),
  };
}

const TOOLS = [
  {
    name: "prepare_memory",
    description:
      "Canonicalize a dmt-memory/v1 JSON memory, SHA-256 it, and return an Ordinals/TAP inscription recipe (content UTF-8 + optional dta pointer). Additional properties are extension fields: they are kept, sorted, and included in the hash. Does not broadcast a Bitcoin transaction or pay fees. Permanence requires inscribing the content on Bitcoin L1 via TAP Wallet or any Ordinals/TAP tool. Browser UI: https://misty-flame-3nw3.here.now/#anchor",
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
    name: "verify_inscription",
    description:
      "Recompute the canonical SHA-256 of a dmt-memory/v1 object and, when inscription_id is provided, attempt to fetch Ordinals content and compare bytes. Extension fields on memory are included in the hash. Optionally enrich with soft-fail Trac Network TAP/DMT index metadata (deployment, mint holder, transfer amount, accumulator). Returns explorer links plus a trac object. Does not use calendar digest proofs. Browser UI: https://misty-flame-3nw3.here.now/#verify",
    inputSchema: {
      type: "object",
      properties: {
        memory: {
          type: "object",
          description:
            "Full dmt-memory/v1 object (agent_id, key, content, tags, created_at). Optional extension fields are hashed.",
        },
        inscription_id: {
          type: "string",
          description: "Bitcoin Ordinals inscription id (txid + 'i' + index)",
        },
        txid: { type: "string", description: "Optional Bitcoin transaction id" },
        sha256: {
          type: "string",
          description: "Optional expected hex digest to cross-check",
        },
        fetch_content: {
          type: "boolean",
          description:
            "Fetch inscription content from ordinals.com when inscription_id is set (default true)",
        },
        include_trac: {
          type: "boolean",
          description:
            "When inscription_id is set, query Trac TAP/DMT index metadata (default true). Soft-fails if Trac is down.",
        },
        trac_rest_base: {
          type: "string",
          description:
            "Optional self-hosted tap-reader REST origin. Falls back to env DMT_TRAC_REST, then public Socket.IO at tap.trac.network.",
        },
      },
      required: ["memory"],
    },
  },
];

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function parsePrepareMemoryArgs(args: Record<string, unknown>): PrepareMemoryInput {
  const agentId = args.agent_id;
  if (typeof agentId !== "string") throw new Error("agent_id must be a string");
  const key = args.key;
  if (typeof key !== "string") throw new Error("key must be a string");
  const tags = optionalStringArray(args, "tags", "tags must be an array of strings");
  const createdAt = optionalString(args, "created_at", "created_at must be a string");
  const extensions = extensionFields(args);
  const input: PrepareMemoryInput = {
    agent_id: agentId,
    key,
    content: args.content,
  };
  if (tags !== undefined) input.tags = tags;
  if (createdAt !== undefined) input.created_at = createdAt;
  if (extensions !== undefined) input.extensions = extensions;
  return input;
}

function parseVerifyInscriptionArgs(args: Record<string, unknown>): VerifyInscriptionInput {
  const digest = optionalString(args, "sha256", "sha256 must be a string");
  const inscriptionId = optionalString(args, "inscription_id", "inscription_id must be a string");
  const txid = optionalString(args, "txid", "txid must be a string");
  const includeTrac = optionalBoolean(args, "include_trac", "include_trac must be a boolean");
  const tracRestBase = optionalString(args, "trac_rest_base", "trac_rest_base must be a string");
  const fetchContent = optionalBoolean(args, "fetch_content", "fetch_content must be a boolean");
  assertMemory(args.memory);
  const input: VerifyInscriptionInput = { memory: args.memory };
  if (digest !== undefined) input.sha256 = digest;
  if (inscriptionId !== undefined) input.inscription_id = inscriptionId;
  if (txid !== undefined) input.txid = txid;
  if (fetchContent !== undefined) input.fetch_content = fetchContent;
  if (includeTrac !== undefined) input.include_trac = includeTrac;
  if (tracRestBase !== undefined) input.trac_rest_base = tracRestBase;
  return input;
}

export async function callTool(name: string, rawArgs: unknown): Promise<ToolResult> {
  try {
    const args = toolArgs(rawArgs);
    if (name === "prepare_memory") {
      const result = prepareMemory(parsePrepareMemoryArgs(args));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "verify_inscription") {
      const result = await verifyInscription(parseVerifyInscriptionArgs(args));
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
}

const server = new Server(
  { name: "dmt-receipts", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) =>
  callTool(request.params.name, request.params.arguments)
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function isCliEntry(entry: string | undefined): boolean {
  if (!entry) return false;
  const normalized = entry.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  return base === "index.js" || base === "index.ts" || base === "dmt-receipts-mcp";
}

if (isCliEntry(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
