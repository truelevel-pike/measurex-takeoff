# Audit Report — Cycle 3, Sector A5, Engineer E8

**Scope:** API routes — assemblies, batch, chat, classifications, duplicate, estimates, export/*
**Date:** 2026-03-20
**Auditor:** E8-SPARK

---

## E8 FINDINGS — Routes: assemblies, batch, chat, classifications, duplicate, estimates, export/*

### Cross-Cutting Issues (all 11 routes)

BUG-A5-3-201: [ALL 11 ROUTE FILES] CRITICAL — No authentication on any route. None of the 11 audited routes verify user identity. Any client with network access can read, create, modify, delete, duplicate, or export any project's data. This is the single highest-risk finding: the entire API surface is unauthenticated.

BUG-A5-3-202: [ALL 11 ROUTE FILES] MEDIUM — No rate limiting on any route. None of the 11 routes implement rate limiting or request throttling. Every endpoint can be hammered without restriction. Particularly dangerous for chat (OpenAI cost), duplicate (I/O-heavy), and batch (500 ops/request).

BUG-A5-3-203: [assemblies/route.ts:24,51 | assemblies/[aid]/route.ts:23,43,60 | batch/route.ts:102,108 | classifications/route.ts:18,48 | classifications/[cid]/route.ts:17,42 | duplicate/route.ts:95 | estimates/route.ts:64,125 | export/contractor/route.ts:411 | export/excel/route.ts:245 | export/json/route.ts:37] MEDIUM — Error messages leak internal details to client. Pattern `err instanceof Error ? err.message : String(err)` exposes file-system paths, JSON parse details, and library-internal error text. Should return a generic message and log details server-side.

---

### src/app/api/projects/[id]/assemblies/route.ts

BUG-A5-3-204: [src/app/api/projects/[id]/assemblies/route.ts:38] HIGH — POST destructures from raw `body` instead of validated `bodyResult.data`. Line 38 reads `classificationId, name, unit, unitCost, quantityFormula` from the unvalidated `body` object even though the Zod schema result is available at `bodyResult.data`. If the schema ever strips or transforms a field, the raw value is used instead.

BUG-A5-3-205: [src/app/api/projects/[id]/assemblies/route.ts:13] MEDIUM — AssemblyBodySchema uses `.passthrough()`, allowing arbitrary unvalidated fields to flow through the schema and potentially be written to the data store. Should use `.strict()` or omit `.passthrough()`.

---

### src/app/api/projects/[id]/assemblies/[aid]/route.ts

BUG-A5-3-206: [src/app/api/projects/[id]/assemblies/[aid]/route.ts:13] MEDIUM — PATCH handler calls `req.json()` without `.catch()`. If the request body is not valid JSON, the raw SyntaxError is thrown and caught by the outer catch, exposing parse error details (including the malformed input) in the 500 response via BUG-A5-3-203.

BUG-A5-3-207: [src/app/api/projects/[id]/assemblies/[aid]/route.ts:33] MEDIUM — PUT handler has the same `req.json()` without `.catch()` issue as BUG-A5-3-206.

---

### src/app/api/projects/[id]/batch/route.ts

BUG-A5-3-208: [src/app/api/projects/[id]/batch/route.ts:41-42] HIGH — Batch endpoint allows up to 500 operations per request with no request-level throttling. An attacker can submit rapid concurrent batch requests, each performing 500 file I/O operations, exhausting server disk I/O and memory. This is a denial-of-service vector.

BUG-A5-3-209: [src/app/api/projects/[id]/batch/route.ts:102] MEDIUM — Per-operation errors leak internal details. Each failed operation returns `err.message` to the client in the results array, exposing file-system errors, JSON parse failures, or store-internal exceptions.

BUG-A5-3-210: [src/app/api/projects/[id]/batch/route.ts:62-104] MEDIUM — Race condition with concurrent batch requests. Operations within a batch run sequentially, but there is no file locking. Two concurrent batch requests modifying the same project will interleave reads and writes on the JSON data files (classifications.json, polygons.json), causing data corruption or lost writes.

---

### src/app/api/projects/[id]/chat/route.ts

BUG-A5-3-211: [src/app/api/projects/[id]/chat/route.ts:19-34] HIGH — ChatBodySchema from api-schemas.ts is defined but NOT used. The route performs ad-hoc validation (manual typeof checks) that lacks: content length limits, role enum validation, message count limits, and the `.refine()` guard present in the schema. The schema was purpose-built for this route and is completely ignored.

BUG-A5-3-212: [src/app/api/projects/[id]/chat/route.ts:23,186] HIGH — Prompt injection via unvalidated message roles. The `messages` array accepts objects with any string `role` (line 23). Line 186 casts `m.role as 'user' | 'assistant'` at the TypeScript level only — the runtime value passes through unchanged to the OpenAI API. A client can send `role: 'system'` to inject system-level prompt content, overriding the application's system prompt and potentially extracting project data or changing AI behavior.

BUG-A5-3-213: [src/app/api/projects/[id]/chat/route.ts:189-201] CRITICAL — No rate limiting on paid OpenAI API proxy. This endpoint forwards every request to OpenAI's `gpt-4o` model at `$2.50-$10/1M tokens`. Without rate limiting or auth, an attacker can rack up unbounded API costs by flooding this endpoint.

BUG-A5-3-214: [src/app/api/projects/[id]/chat/route.ts:189] MEDIUM — No timeout on fetch to OpenAI. The `fetch()` call has no `AbortController` or `signal` timeout. If OpenAI hangs or is slow, the route handler blocks indefinitely, consuming a server connection slot. Under load this leads to connection exhaustion.

BUG-A5-3-215: [src/app/api/projects/[id]/chat/route.ts:22-31] MEDIUM — No message content length limit. Neither `message` (string) nor `messages` (array) have maximum length constraints. A user can send megabytes of text, causing expensive server-side processing (string concatenation for the system prompt) and high OpenAI token costs even with a single request.

BUG-A5-3-216: [src/app/api/projects/[id]/chat/route.ts:75,86-87,120] LOW — Unsafe type assertions on polygon data. `(p as unknown as Record<string, unknown>).pageNumber` and `.detectedByModel` bypass TypeScript's type system. If the Polygon type is ever updated to include these fields, these casts will silently hide the migration. Should extend the Polygon type or use proper type guards.

---

### src/app/api/projects/[id]/classifications/route.ts

BUG-A5-3-217: [src/app/api/projects/[id]/classifications/route.ts:34,39-41] HIGH — POST passes unvalidated fields from raw body to store. `body.id` (line 34), `body.formula` (line 39), `body.formulaUnit` (line 40), and `body.formulaSavedToLibrary` (line 41) are read directly from the raw request body. These fields are NOT in `ClassificationCreateSchema` and are never validated. `body.id` in particular accepts any string — not enforced as UUID — allowing a client to set arbitrary classification IDs that may break downstream UUID-based lookups or create data inconsistencies.

---

### src/app/api/projects/[id]/classifications/[cid]/route.ts

BUG-A5-3-218: [src/app/api/projects/[id]/classifications/[cid]/route.ts:36,38] HIGH — PATCH/PUT passes raw body to updateClassification instead of validated data. Line 36 validates with `ClassificationUpdateSchema.passthrough().safeParse(body)`, but line 38 passes the original `body` to the store — not `bodyResult.data`. Combined with `.passthrough()`, this allows arbitrary fields (not in the schema) to be written to the classification record, enabling data injection.

BUG-A5-3-219: [src/app/api/projects/[id]/classifications/[cid]/route.ts:13-14] LOW — DELETE returns HTTP 200 with `{ ok: false }` when classification does not exist. Conventional REST APIs return 404 for "not found". Clients that check HTTP status codes (not the body) will incorrectly treat a missing resource as a success.

---

### src/app/api/projects/[id]/duplicate/route.ts

BUG-A5-3-220: [src/app/api/projects/[id]/duplicate/route.ts:30-89] MEDIUM — Race condition during project duplication. The route reads classifications, polygons, scale, and pages in parallel (line 30-35), then creates them sequentially (lines 40-85). If the source project is modified between the parallel reads and sequential writes, the duplicated project will contain inconsistent data (e.g., polygons referencing classifications that were deleted after the read).

BUG-A5-3-221: [src/app/api/projects/[id]/duplicate/route.ts:40-74] MEDIUM — Sequential await loops make duplication a DoS vector. Classifications (line 40-51), polygons (line 53-63), and pages (line 65-74) are each created one-at-a-time in `for` loops with `await`. A project with thousands of polygons makes this route take minutes. Combined with no rate limiting (BUG-A5-3-202) and no auth (BUG-A5-3-201), an attacker can tie up server resources by duplicating large projects repeatedly.

---

### src/app/api/projects/[id]/estimates/route.ts

CLEAN: src/app/api/projects/[id]/estimates/route.ts — No file-specific bugs beyond cross-cutting issues (BUG-A5-3-201, -202, -203). Input validation is proper via Zod schemas. Both GET and POST have try/catch. Response shapes are appropriate for their respective operations. Read-only data access minimizes race condition risk.

---

### src/app/api/projects/[id]/export/contractor/route.ts

BUG-A5-3-222: [src/app/api/projects/[id]/export/contractor/route.ts:147-149] MEDIUM — Classification color values embedded in SVG attributes without HTML escaping. `stroke="${color}"` and `fill="${color}"` inject `cls.color` directly into SVG markup. While `ClassificationCreateSchema` validates color as `/^#[0-9a-fA-F]{6}$/`, the update path in classifications/[cid] passes raw body to the store (BUG-A5-3-218). If a malicious color like `"><script>alert(1)</script>` is stored via the update bypass, it will execute as XSS when the contractor report HTML is rendered in a browser.

BUG-A5-3-223: [src/app/api/projects/[id]/export/contractor/route.ts:170] LOW — Thumbnail data URL embedded in `<img src>` without sanitization. `<img src="${thumbnail}"` reads from thumbnail.txt on disk and embeds it directly. If the file contains a non-data-URL value (e.g., via direct file manipulation or a bug in the upload path), it could be a content injection vector. Risk is low because modern browsers don't execute JS from img src, but the pattern is unsafe.

---

### src/app/api/projects/[id]/export/excel/route.ts

BUG-A5-3-224: [src/app/api/projects/[id]/export/excel/route.ts:185-191] HIGH — `unitCosts` query parameter deserialized from base64 without schema validation. The value is base64-decoded, JSON-parsed, and immediately cast as `UnitCostMap` (line 187) with no Zod or runtime validation. Malformed input (e.g., missing `costPerUnit`, non-numeric values, negative costs, or deeply nested objects) could cause runtime errors at line 142 when accessing properties, produce incorrect cost calculations, or lead to unexpected data in the exported Excel file.

---

### src/app/api/projects/[id]/export/json/route.ts

BUG-A5-3-225: [src/app/api/projects/[id]/export/json/route.ts:21-22] LOW — Full project data exported with no field filtering. The entire `project`, `pages`, `classifications`, `polygons`, and `scale` objects are serialized to JSON as-is. Any internal-only or sensitive fields added to these records in the future (e.g., audit metadata, internal processing state, user IDs) will be automatically included in the export without review. Consider an explicit allowlist of exported fields.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 8     |
| MEDIUM   | 11    |
| LOW      | 3     |
| **Total** | **25** |

### Critical Path
The most urgent chain: **BUG-A5-3-201** (no auth) + **BUG-A5-3-213** (no rate limit on OpenAI proxy) = unbounded financial exposure. Any internet-accessible deployment of this application allows anonymous users to generate unlimited OpenAI API charges.

### Clean Files
- `src/app/api/projects/[id]/estimates/route.ts` — clean (no file-specific bugs beyond cross-cutting)

### Files Audited
1. src/app/api/projects/[id]/assemblies/route.ts
2. src/app/api/projects/[id]/assemblies/[aid]/route.ts
3. src/app/api/projects/[id]/batch/route.ts
4. src/app/api/projects/[id]/chat/route.ts
5. src/app/api/projects/[id]/classifications/route.ts
6. src/app/api/projects/[id]/classifications/[cid]/route.ts
7. src/app/api/projects/[id]/duplicate/route.ts
8. src/app/api/projects/[id]/estimates/route.ts
9. src/app/api/projects/[id]/export/contractor/route.ts
10. src/app/api/projects/[id]/export/excel/route.ts
11. src/app/api/projects/[id]/export/json/route.ts

---
*End of E8 audit — Cycle 3, Sector A5*
