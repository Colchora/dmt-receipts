#!/usr/bin/env node
/**
 * DMT Receipts MCP server: prepare_memory and verify_inscription.
 * Protocol: https://misty-flame-3nw3.here.now/llms.txt
 * Permanence: Bitcoin TAP Protocol / Ordinals inscriptions (not calendar digests).
 */
import { createHash } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
const TAP_DOCS = "https://docs.tap-protocol.com/";
const TAP_SPECS = "https://github.com/Trac-Systems/tap-protocol-specs";
const ORD_CONTENT = (id) => `https://ordinals.com/content/${encodeURIComponent(id)}`;
const ORD_INSCRIPTION = (id) => `https://ordinals.com/inscription/${encodeURIComponent(id)}`;
const MEMPOOL_TX = (txid) => `https://mempool.space/tx/${encodeURIComponent(txid)}`;
const FETCH_TIMEOUT_MS = 15_000;
function compareCodePoints(left, right) {
    const a = Array.from(left, (char) => char.codePointAt(0));
    const b = Array.from(right, (char) => char.codePointAt(0));
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
        if (a[i] !== b[i])
            return a[i] - b[i];
    }
    return a.length - b.length;
}
function stringifyPrimitive(value) {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
        throw new Error("Value cannot be represented in JSON");
    return encoded;
}
function canonicalJson(value, path = "memory") {
    if (value === null)
        return "null";
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
            const encodedValue = canonicalJson(value[key], `${path}.${key}`);
            return `${encodedKey}:${encodedValue}`;
        });
        return `{${serialized.join(",")}}`;
    }
    throw new Error(`${path} contains a value that cannot be represented in JSON`);
}
export function canonicalBytes(memory) {
    return Buffer.from(canonicalJson(memory), "utf8");
}
export function sha256(bytes) {
    return createHash("sha256").update(bytes).digest();
}
function utcNowIso() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
function isUtcTimestamp(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value))
        return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString().replace(/\.\d{3}Z$/, "Z") === value;
}
function assertMemory(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("memory must be a dmt-memory/v1 object");
    }
    const memory = value;
    if (typeof memory.agent_id !== "string" || !memory.agent_id) {
        throw new Error("memory.agent_id must be a non-empty string");
    }
    if (typeof memory.key !== "string" || !memory.key) {
        throw new Error("memory.key must be a non-empty string");
    }
    const contentType = typeof memory.content;
    if (memory.content === null ||
        !["string", "object", "number", "boolean"].includes(contentType)) {
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
export function prepareMemory(args) {
    const memory = {
        agent_id: args.agent_id,
        content: args.content,
        created_at: args.created_at ?? utcNowIso(),
        key: args.key,
        tags: args.tags ?? [],
    };
    assertMemory(memory);
    const canonicalBuf = canonicalBytes(memory);
    const digest = sha256(canonicalBuf);
    const hex = digest.toString("hex");
    const canonical = canonicalBuf.toString("utf8");
    const dta = `sha256:${hex}`.slice(0, 512);
    return {
        memory,
        canonical,
        sha256: hex,
        byte_length: canonicalBuf.length,
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
            note: "Inscribe content_utf8 as Ordinals content (application/json or text/plain). This MCP tool does not broadcast Bitcoin transactions or pay fees. optional_tap_op_example is only for token-deploy flows that carry dta (≤512 bytes); it does not replace content inscription for full memories.",
        },
    };
}
export async function verifyInscription(args) {
    assertMemory(args.memory);
    const canonicalBuf = canonicalBytes(args.memory);
    const digest = sha256(canonicalBuf);
    const hex = digest.toString("hex");
    const hexOk = !args.sha256 || args.sha256.toLowerCase() === hex;
    const links = [];
    if (args.inscription_id) {
        links.push(ORD_INSCRIPTION(args.inscription_id));
        links.push(ORD_CONTENT(args.inscription_id));
    }
    if (args.txid)
        links.push(MEMPOOL_TX(args.txid));
    const contentFetch = {
        attempted: false,
        ok: false,
        matches_canonical: false,
        remote_sha256: undefined,
        error: undefined,
    };
    const shouldFetch = args.fetch_content !== false && Boolean(args.inscription_id);
    if (shouldFetch && args.inscription_id) {
        contentFetch.attempted = true;
        try {
            const response = await fetch(ORD_CONTENT(args.inscription_id), {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) {
                contentFetch.error = `HTTP ${response.status}`;
            }
            else {
                const remote = Buffer.from(await response.arrayBuffer());
                contentFetch.ok = true;
                contentFetch.remote_sha256 = sha256(remote).toString("hex");
                contentFetch.matches_canonical =
                    remote.equals(canonicalBuf) || contentFetch.remote_sha256 === hex;
            }
        }
        catch (error) {
            contentFetch.error = error instanceof Error ? error.message : String(error);
        }
    }
    const ok = hexOk &&
        (!contentFetch.attempted || contentFetch.matches_canonical) &&
        Boolean(args.inscription_id || args.txid || contentFetch.matches_canonical);
    let note;
    if (contentFetch.matches_canonical) {
        note =
            "Inscription content matches canonical memory bytes. Confirm explorer/TAP indexer links for human review.";
    }
    else if (!args.inscription_id && !args.txid) {
        note =
            "Local canonical hash only. Provide inscription_id (preferred) or txid, then re-run with fetch_content true.";
    }
    else if (contentFetch.attempted && !contentFetch.matches_canonical) {
        note =
            "Could not confirm content match via ordinals.com fetch. Open explorer_links and compare bytes manually. Fees/indexing are outside this tool.";
    }
    else {
        note =
            "Prepared local digest is consistent. On-chain permanence requires a confirmed Ordinals inscription whose content equals the canonical UTF-8 JSON.";
    }
    return {
        ok: Boolean(ok && hexOk && (contentFetch.matches_canonical || !contentFetch.attempted)),
        sha256: hex,
        byte_length: canonicalBuf.length,
        matches_expected_sha256: hexOk,
        content_fetch: contentFetch,
        explorer_links: links,
        note,
    };
}
const server = new Server({ name: "dmt-receipts", version: "0.2.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "prepare_memory",
            description: "Canonicalize a dmt-memory/v1 JSON memory, SHA-256 it, and return an Ordinals/TAP inscription recipe (content UTF-8 + optional dta pointer). Does not broadcast a Bitcoin transaction or pay fees. Permanence requires inscribing the content on Bitcoin L1 via TAP Wallet or any Ordinals/TAP tool.",
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
            description: "Recompute the canonical SHA-256 of a dmt-memory/v1 object and, when inscription_id is provided, attempt to fetch Ordinals content and compare bytes. Returns explorer links. Does not use calendar digest proofs.",
            inputSchema: {
                type: "object",
                properties: {
                    memory: {
                        type: "object",
                        description: "Full dmt-memory/v1 object (agent_id, key, content, tags, created_at)",
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
                        description: "Fetch inscription content from ordinals.com when inscription_id is set (default true)",
                    },
                },
                required: ["memory"],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {});
    try {
        if (name === "prepare_memory") {
            if (typeof args.agent_id !== "string")
                throw new Error("agent_id must be a string");
            if (typeof args.key !== "string")
                throw new Error("key must be a string");
            if (args.tags !== undefined &&
                (!Array.isArray(args.tags) || !args.tags.every((tag) => typeof tag === "string"))) {
                throw new Error("tags must be an array of strings");
            }
            if (args.created_at !== undefined && typeof args.created_at !== "string") {
                throw new Error("created_at must be a string");
            }
            const result = prepareMemory({
                agent_id: args.agent_id,
                key: args.key,
                content: args.content,
                tags: args.tags,
                created_at: args.created_at,
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        if (name === "verify_inscription") {
            if (args.sha256 !== undefined && typeof args.sha256 !== "string") {
                throw new Error("sha256 must be a string");
            }
            if (args.inscription_id !== undefined && typeof args.inscription_id !== "string") {
                throw new Error("inscription_id must be a string");
            }
            if (args.txid !== undefined && typeof args.txid !== "string") {
                throw new Error("txid must be a string");
            }
            const result = await verifyInscription({
                memory: args.memory,
                inscription_id: args.inscription_id,
                txid: args.txid,
                sha256: args.sha256,
                fetch_content: args.fetch_content,
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        throw new Error(`Unknown tool: ${name}`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: JSON.stringify({ error: message }) }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
