# Audit A5 — Cycle 3 — Engineer E8

**Scope:** API route security & quality audit
**Date:** 2026-03-20
**Engineer:** E8
**Bug ID range:** BUG-A5-3-101 through BUG-A5-3-131

---

## Files Audited

| # | File | Verdict |
|---|------|---------|
| 1 | `src/app/api/projects/[id]/ai-takeoff/route.ts` | ISSUES FOUND |
| 2 | `src/app/api/projects/[id]/ai-takeoff/apply/route.ts` | ISSUES FOUND |
| 3 | `src/app/api/projects/[id]/assemblies/route.ts` | ISSUES FOUND |
| 4 | `src/app/api/projects/[id]/assemblies/[aid]/route.ts` | ISSUES FOUND |
| 5 | `src/app/api/projects/[id]/batch/route.ts` | ISSUES FOUND |
| 6 | `src/app/api/projects/[id]/chat/route.ts` | ISSUES FOUND |
| 7 | `src/app/api/projects/[id]/classifications/route.ts` | ISSUES FOUND |
| 8 | `src/app/api/projects/[id]/classifications/[cid]/route.ts` | ISSUES FOUND |
| 9 | `src/app/api/projects/[id]/duplicate/route.ts` | ISSUES FOUND |
| 10 | `src/app/api/projects/[id]/estimates/route.ts` | ISSUES FOUND |
| 11 | `src/app/api/projects/[id]/export/contractor/route.ts` | ISSUES FOUND |
| 12 | `src/app/api/projects/[id]/export/excel/route.ts` | ISSUES FOUND |
| 13 | `src/app/api/projects/[id]/export/json/route.ts` | ISSUES FOUND |

---

## Cross-Cutting Findings

### BUG-A5-3-101: [ALL 13 FILES] CRITICAL — No authentication or authorization on any API route

None of the 13 audited routes verify the identity of the caller. There is no session check, no JWT validation, no API key requirement, and no middleware guard. Every endpoint is fully accessible to unauthenticated requests. An attacker who knows (or guesses) a project UUID can read, modify, duplicate, or delete any project's data — classifications, polygons, assemblies, and exports. This is the single most critical finding in this audit.

**Affected files (all 13):**
- `ai-takeoff/route.ts`
- `ai-takeoff/apply/route.ts`
- `assemblies/route.ts`
- `assemblies/[aid]/route.ts`
- `batch/route.ts`
- `chat/route.ts`
- `classifications/route.ts`
- `classifications/[cid]/route.ts`
- `duplicate/route.ts`
- `estimates/route.ts`
- `export/contractor/route.ts`
- `export/excel/route.ts`
- `export/json/route.ts`

### BUG-A5-3-102: [12 of 13 FILES] HIGH — No rate limiting on write/read endpoints

Only `ai-takeoff/route.ts` applies `rateLimitResponse()`. The remaining 12 routes have no rate limiting at all. Particularly dangerous endpoints:
- `chat/route.ts` — proxies to OpenAI, direct financial exposure
- `batch/route.ts` — accepts up to 500 operations per request
- `duplicate/route.ts` — performs many sequential DB writes
- `ai-takeoff/apply/route.ts` — creates unbounded classifications/polygons

### BUG-A5-3-103: [10+ FILES] MEDIUM — Error messages leak internal details to clients

Most catch blocks return `err.message` directly to the caller. Node.js error messages can contain file system paths, database connection strings, library internals, and stack fragments. Files affected include:
- `assemblies/route.ts:24` — `err.message` or `String(err)`
- `assemblies/[aid]/route.ts:23,43,60` — same pattern
- `batch/route.ts:102,108` — inner op errors + outer error
- `classifications/route.ts:48` — `err.message`
- `classifications/[cid]/route.ts:16,42` — `err.message`
- `duplicate/route.ts:95` — `err.message`
- `estimates/route.ts:64,125` — `err.message`
- `export/excel/route.ts:245` — `err.message`
- `export/json/route.ts:37` — `err.message`
- `ai-takeoff/route.ts:70` — wraps `err.message` but still includes raw text
- `ai-takeoff/apply/route.ts:240` — `err.message`

---

## Per-File Findings

### File 1: `src/app/api/projects/[id]/ai-takeoff/route.ts`

BUG-A5-3-104: [ai-takeoff/route.ts:22-24] MEDIUM — No Zod schema validation for request body

The body is parsed with `req.json()` and fields are extracted manually (`body?.page`, `body?.model`). An `AiTakeoffBodySchema` exists in `api-schemas.ts` but is not used. The manual `Number.isInteger` check on `page` is adequate but the `model` field only checks `typeof === 'string'` — no allowlist or length limit. A megabyte-long model string would be passed to `analyzePageImage`.

BUG-A5-3-105: [ai-takeoff/route.ts:70] MEDIUM — Raw error message from AI engine forwarded to client

Line 70: `const raw = err instanceof Error ? err.message : 'AI takeoff failed'`. The raw message could contain OpenAI/Anthropic API error details, file paths from `renderPageAsImage`, or library internals. These are embedded in the client-facing response on line 71.

### File 2: `src/app/api/projects/[id]/ai-takeoff/apply/route.ts`

BUG-A5-3-106: [ai-takeoff/apply/route.ts:128] MEDIUM — `page` parameter not validated as positive integer

Line 128: `const page: number = body?.page ?? 1`. No type check, no range check. If `body.page` is `"foo"`, it becomes the string `"foo"`. If it's `-5`, it's used as-is. This value is passed to `deletePolygonsByPage` and used as `pageNumber` in `createPolygon`. Could cause corrupted data or unexpected query behavior.

BUG-A5-3-107: [ai-takeoff/apply/route.ts:139] MEDIUM — Validated elements discarded; raw input used instead

Line 139: `validElements.push(el as AIDetectedElement)`. The Zod parse produces `result.data` with validated/coerced values, but the code pushes the original `el` object with an `as` cast. Any extra properties on the raw input (prototype pollution vectors, unexpected fields) pass through to downstream functions.

BUG-A5-3-108: [ai-takeoff/apply/route.ts:159-161] HIGH — Race condition in delete-then-insert for page polygons

Lines 159-161: `deletePolygonsByPage(id, page)` followed by `getPolygons(id)`. Two concurrent POST requests for the same page will both delete existing polygons, then both insert their elements, resulting in duplicate data. No locking or transaction isolation exists.

### File 3: `src/app/api/projects/[id]/assemblies/route.ts`

BUG-A5-3-109: [assemblies/route.ts:38] HIGH — Raw body used instead of Zod-validated data

Line 36-38: `AssemblyBodySchema.safeParse(body)` validates the body, but line 38 destructures from raw `body` instead of `bodyResult.data`. Combined with `.passthrough()` on the schema (line 13), any arbitrary properties from the client are accepted and the validated/coerced values are ignored. An attacker could pass fields with unexpected types that survive past validation.

### File 4: `src/app/api/projects/[id]/assemblies/[aid]/route.ts`

CLEAN: `assemblies/[aid]/route.ts` — no file-specific issues beyond the cross-cutting auth/rate-limit/error-leak findings (BUG-A5-3-101, -102, -103).

### File 5: `src/app/api/projects/[id]/batch/route.ts`

BUG-A5-3-110: [batch/route.ts:6] MEDIUM — PointSchema allows non-finite numbers (NaN, Infinity)

Line 6: `z.object({ x: z.number(), y: z.number() })`. Unlike the `PointSchema` in `apply/route.ts` which uses `.finite()`, this one accepts `NaN`, `Infinity`, and `-Infinity` as coordinates. These would create corrupted polygon data.

BUG-A5-3-111: [batch/route.ts:62-104] MEDIUM — No transactional rollback on partial batch failure

Operations execute sequentially in a loop. If operation #250 of 500 fails, the first 249 are already committed. There is no rollback mechanism. The client receives a mixed results array but the data is in an inconsistent state that may be difficult to recover from.

BUG-A5-3-112: [batch/route.ts:102] MEDIUM — Inner operation error messages leaked to client

Line 102: `error: err instanceof Error ? err.message : String(err)`. Each individual operation failure exposes its raw error message, which could contain file system paths or internal state details.

### File 6: `src/app/api/projects/[id]/chat/route.ts`

BUG-A5-3-113: [chat/route.ts] CRITICAL — No rate limiting on OpenAI API proxy endpoint

This route forwards every request to `https://api.openai.com/v1/chat/completions` using the server's API key. Without rate limiting or auth, an attacker can make unlimited requests, directly incurring OpenAI API costs on the server owner's account. With `gpt-4o` at ~$5/1M input tokens and the system prompt including full project data, costs escalate rapidly.

BUG-A5-3-114: [chat/route.ts:186] HIGH — User-controlled message roles allow system prompt injection

Line 186: `m.role as 'user' | 'assistant'`. The `role` field comes from `body.messages` with no validation — it's typed as `string` (line 23). An attacker can pass `role: 'system'` to inject additional system-level instructions into the OpenAI call, overriding the application's system prompt. The `ChatBodySchema` in `api-schemas.ts` properly restricts roles to `['user', 'assistant']` but is never used in this route.

BUG-A5-3-115: [chat/route.ts:19-34] MEDIUM — Existing ChatBodySchema not used; manual validation instead

`api-schemas.ts` exports a well-defined `ChatBodySchema` with proper role validation, message constraints, and context typing. This route ignores it entirely and performs ad-hoc manual validation that misses role validation, message length limits, and content sanitization.

BUG-A5-3-116: [chat/route.ts:75,87,120] LOW — Multiple `as unknown as Record<string, unknown>` casts

Lines 75, 87, and 120 cast polygon objects through `unknown` to access `pageNumber` and `detectedByModel`. This suggests the `Polygon` type definition is incomplete or out of date. These casts suppress compile-time type checking and could mask real bugs if the field names change.

BUG-A5-3-117: [chat/route.ts:189-201] MEDIUM — No timeout or AbortSignal on outbound OpenAI fetch

The `fetch()` call to OpenAI has no timeout. If OpenAI is slow or unresponsive, the request hangs indefinitely, consuming a server connection. Under load, this could exhaust the connection pool. Should use `AbortSignal.timeout()` or equivalent.

### File 7: `src/app/api/projects/[id]/classifications/route.ts`

BUG-A5-3-118: [classifications/route.ts:34,39-41] HIGH — Unvalidated fields from raw body bypass Zod schema

Line 32 validates `body` against `ClassificationCreateSchema`, but lines 34 and 39-41 read `body.id`, `body.formula`, `body.formulaUnit`, and `body.formulaSavedToLibrary` directly from the raw request body. These fields are not in `ClassificationCreateSchema` and are never validated. Particularly dangerous: `body.id` lets the client specify the UUID for the new classification.

BUG-A5-3-119: [classifications/route.ts:34] MEDIUM — Client-specified UUID allows ID collision/overwrite

Line 34: `id: body.id` is passed to `createClassification`. If the store uses this ID as-is without checking for collisions, a client can overwrite an existing classification by providing its UUID. This could also be used to create predictable IDs for cross-project reference attacks.

### File 8: `src/app/api/projects/[id]/classifications/[cid]/route.ts`

BUG-A5-3-120: [classifications/[cid]/route.ts:36,38] HIGH — `.passthrough()` plus raw body passed to store

Line 36: `ClassificationUpdateSchema.passthrough().safeParse(body)` validates known fields but allows arbitrary extra properties. Line 38: `updateClassification(id, cid, body)` passes the raw `body` (not `bodyResult.data`). An attacker can inject any fields into the classification record, potentially corrupting data or exploiting store-level behaviors.

BUG-A5-3-121: [classifications/[cid]/route.ts:12-14] LOW — DELETE returns 200 with `{ok: false}` instead of 404

Lines 12-14: When `deleteClassification` returns `false` (classification not found), the response is still `200 OK` with `{ ok: false }`. Every other route returns 404 for missing resources. This inconsistency complicates client error handling.

### File 9: `src/app/api/projects/[id]/duplicate/route.ts`

BUG-A5-3-122: [duplicate/route.ts:56] MEDIUM — Fallback creates orphaned polygon references

Line 56: `classificationIdMap.get(polygon.classificationId) || polygon.classificationId`. If a classification mapping is missing (e.g., race condition or data corruption), the polygon is created in the new project referencing the *source project's* classification ID. This creates an orphaned polygon that won't display correctly and may cause downstream errors.

BUG-A5-3-123: [duplicate/route.ts:40-74] MEDIUM — No concurrency guard on expensive sequential operation

The duplication loop sequentially creates classifications, polygons, and pages with no locking. Two concurrent duplicate requests for the same project would both succeed, doubling the storage impact. Combined with no rate limiting (BUG-A5-3-102), this is a straightforward resource exhaustion vector.

### File 10: `src/app/api/projects/[id]/estimates/route.ts`

CLEAN: `estimates/route.ts` — no file-specific issues beyond the cross-cutting auth/rate-limit/error-leak findings (BUG-A5-3-101, -102, -103).

### File 11: `src/app/api/projects/[id]/export/contractor/route.ts`

BUG-A5-3-124: [export/contractor/route.ts:145-149] HIGH — Stored XSS via unescaped classification colors in SVG

Lines 145-149 in `buildSvgOverlay`: classification `color` values are interpolated directly into SVG `fill` and `stroke` attributes without escaping:
```
stroke="${color}"
fill="${color}"
```
While `ClassificationCreateSchema` validates colors as `/^#[0-9a-fA-F]{6}$/`, the AI takeoff apply route (`apply/route.ts:27`) defines its own `ElementSchema` where `color` is just `z.string().optional()`. A malicious or buggy AI response with `color: '"/><script>alert(1)</script>'` would be stored and rendered as XSS when the contractor report is viewed.

BUG-A5-3-125: [export/contractor/route.ts:170] MEDIUM — Thumbnail data embedded in img src without sanitization

Line 170: `<img src="${thumbnail}"`. The thumbnail value from the store is injected directly into an HTML `src` attribute. If the thumbnail data is corrupted or contains a `javascript:` URI or breaks out of the attribute, it becomes an XSS vector. Should be validated as a data URL or escaped.

### File 12: `src/app/api/projects/[id]/export/excel/route.ts`

BUG-A5-3-126: [export/excel/route.ts:187] MEDIUM — `unitCosts` query param parsed and cast without validation

Line 187: `JSON.parse(Buffer.from(unitCostsParam, 'base64').toString('utf-8')) as UnitCostMap`. The base64-decoded JSON is cast to `UnitCostMap` with `as` — no Zod validation. While the downstream usage (line 142: `unitCosts[row.classificationId]?.costPerUnit ?? 0`) is relatively safe due to optional chaining, any unexpected shape passes silently. A malformed payload could cause unexpected `NaN` values in the spreadsheet.

### File 13: `src/app/api/projects/[id]/export/json/route.ts`

CLEAN: `export/json/route.ts` — no file-specific issues beyond the cross-cutting auth/rate-limit/error-leak findings (BUG-A5-3-101, -102, -103).

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 8 |
| MEDIUM | 14 |
| LOW | 2 |
| **Total** | **27** |

### Critical (fix immediately)
- **BUG-A5-3-101** — No authentication on any route
- **BUG-A5-3-113** — No rate limiting on OpenAI proxy (financial risk)
- **BUG-A5-3-103** — Error messages leak internals across 10+ files

### High (fix before release)
- **BUG-A5-3-102** — No rate limiting on 12 of 13 routes
- **BUG-A5-3-108** — Race condition in apply page polygons
- **BUG-A5-3-109** — Raw body bypasses Zod in assemblies
- **BUG-A5-3-114** — System prompt injection via unvalidated roles
- **BUG-A5-3-118** — Unvalidated fields in classification creation
- **BUG-A5-3-120** — Passthrough + raw body in classification update
- **BUG-A5-3-124** — Stored XSS in contractor report SVG

### Top Recommendations
1. **Add auth middleware** — Implement a Next.js middleware or per-route guard that validates session/JWT before any route handler executes.
2. **Apply rate limiting universally** — Wrap all mutation endpoints with `rateLimitResponse()`. Apply strict limits to the chat proxy.
3. **Use validated data consistently** — Every route that calls `.safeParse(body)` must use `result.data`, never the raw `body`. Remove all `.passthrough()` calls.
4. **Sanitize error messages** — Replace `err.message` in all catch blocks with generic messages. Log the real error server-side only.
5. **Escape SVG attributes** — HTML-escape color values before interpolating into SVG markup. Validate thumbnail URLs.
6. **Add ChatBodySchema** — The schema exists; use it in the chat route to block system-role injection.

---

*Audit complete. 27 bugs identified across 13 files. No files were clean of all issues.*
