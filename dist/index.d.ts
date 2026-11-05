#!/usr/bin/env node
export type TracLookupResult = {
    ok: boolean;
    source?: string;
    deployment_tap?: unknown;
    dmt_mint_holder?: unknown;
    transfer_amount?: unknown;
    accumulator?: unknown;
    error?: string;
};
export declare function fetchTracMetadata(args: {
    inscription_id: string;
    trac_rest_base?: string;
}): Promise<TracLookupResult>;
export type MemoryV1 = {
    agent_id: string;
    key: string;
    content: unknown;
    tags: string[];
    created_at: string;
    [extension: string]: unknown;
};
export declare function canonicalBytes(memory: MemoryV1): Buffer;
export declare function sha256(bytes: Buffer): Buffer;
export declare function prepareMemory(args: {
    agent_id: string;
    key: string;
    content: unknown;
    tags?: string[];
    created_at?: string;
}): {
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
};
export declare function verifyInscription(args: {
    memory: MemoryV1;
    inscription_id?: string;
    txid?: string;
    sha256?: string;
    fetch_content?: boolean;
    include_trac?: boolean;
    trac_rest_base?: string;
}): Promise<{
    ok: boolean;
    sha256: string;
    byte_length: number;
    matches_expected_sha256: boolean;
    content_fetch: {
        attempted: boolean;
        ok: boolean;
        matches_canonical: boolean;
        remote_sha256?: string;
        error?: string;
    };
    explorer_links: string[];
    note: string;
    trac?: TracLookupResult;
}>;
