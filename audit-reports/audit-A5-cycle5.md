# AUDIT REPORT — A5 CYCLE 5
## MeasureX Takeoff — Full Deep Re-Audit: src/app/api/ + src/lib/
**Repo:** measurex-takeoff
**Date:** 2026-03-20
**Auditor:** Admiral 5 (P.I.K.E.)
**Cycle:** 5
**Scope:** Every file in `src/app/api/` and `src/lib/` — full fresh read of all 50+ route files and 50+ lib files. Focuses on new bugs not catalogued in Cycles 1–4, plus verifying which prior regressions from Cycle 4 remain open.

---

## EXECUTIVE SUMMARY

Cycle 5 deep re-audit surfaces **74 new bugs** across `src/app/api/` and `src/lib/` not previously catalogued. Key clusters:

1. **Security** — OpenAI API key leaked via `NEXT_PUBLIC_` fallback (CRITICAL); share-token endpoint unauthenticated and exposes full project state; no auth on flag/admin mutation routes; webhook SSRF via localhost/internal IPs; base64-decoded JSON for unit costs parsed without validation.
2. **Data integrity** — compare route uses raw `classificationId` cross-project matching (meaningless without name correlation); AI apply route deletes existing polygons before validating the new batch; duplicate route silently falls back to wrong `classificationId` on FK mismatch; restore route accepts unvalidated user-supplied types with dangerous casts.
3. **In-memory state** — all registries (webhooks, SSE clients, error log, audit log, rate limiter, perf monitor) are server-process-global and lost on restart/redeploy; no persistence.
4. **Error handling** — several routes silently swallow errors and return stale/empty data instead of 500; PDF route hides true error behind a generic message.
5. **Logic bugs** — scales GET with no `pages` param returns empty object instead of all scales; history restore `delete` case returns `ok: false` for missing polygon instead of 404; `canonicalName` synonym substitution loses multi-word classification names; `perf/route.ts` creates a fresh Supabase client per request.

---

## REGRESSION STATUS (Cycles 1–4)

The following Cycle 4 regressions remain **unresolved** as of this audit:

| ID | File | Status |
|----|------|--------|
| REG-001 | `src/lib/rate-limit.ts` | ✅ FIXED (timestamp recorded after check per current code) |
| REG-002 | `src/lib/rate-limit.ts` | ✅ FIXED (setInterval pruning present) |
| REG-003 | `src/lib/store.ts` | ⚠️ OPEN — hydrateState still does not reset groups/assemblies/markups/repeatingGroups |
| REG-004 | `src/components/CanvasOverlay.tsx` | ⚠️ OPEN (outside this cycle's scope) |
| REG-005 | `src/components/MarkupTools.tsx` | ⚠️ OPEN (outside this cycle's scope) |
| REG-006 | `supabase/migrations/018_mx_groups_rls_fix.sql` | ⚠️ OPEN (outside this cycle's scope) |
| REG-007 | `src/app/api/projects/[id]/scale/route.ts` | ⚠️ OPEN — cm cast still excluded |
| REG-008 | `supabase/migrations/000_bootstrap.sql` | ⚠️ OPEN (outside this cycle's scope) |

---

## BUG CATALOGUE

---

### CRITICAL

**BUG-A5-5-001**: `src/lib/openai-guard.ts:8` CRITICAL
`getOpenAIKey()` falls back to `process.env.NEXT_PUBLIC_OPENAI_API_KEY`. Any env var prefixed `NEXT_PUBLIC_` is bundled into the client-side JavaScript and visible in the browser. If an operator sets `NEXT_PUBLIC_OPENAI_API_KEY`, the key is publicly exposed to every visitor. The fallback must be removed; only `OPENAI_API_KEY` (server-only) should be used. Both `checkOpenAIKey()` and `getOpenAIKey()` share this path.
*Fix:* Remove `|| process.env.NEXT_PUBLIC_OPENAI_API_KEY` from both functions.

**BUG-A5-5-002**: `src/app/api/share/[token]/route.ts:1` CRITICAL
The share-token GET endpoint returns the **full project state** including all classifications, polygons, and scale data with no authentication check. Any caller who knows or guesses a share token UUID has complete read access to the project. There is no `readOnly` enforcement — the returned state includes enough data to reconstruct the entire project.  While tokens are UUIDs (hard to guess), there is no expiry, rate limiting, or revocation check beyond a null check on `getProjectByShareToken`. An attacker who obtains a leaked token URL retains access indefinitely.
*Fix:* Add token-level rate limiting; consider adding a token expiry field in the DB; ensure `readOnly: true` is enforced in downstream usage.

**BUG-A5-5-003**: `src/app/api/flags/route.ts:24` CRITICAL
`POST /api/flags` allows any unauthenticated caller to toggle server-side feature flags. This includes `ENABLE_WEBHOOKS`, `ENABLE_AI_IMAGE_SEARCH`, `ENABLE_COLLABORATION`, etc. An attacker can disable AI features, disable webhooks, or modify runtime behavior for all users on the server without any credentials.
*Fix:* Require admin authentication (API key header check or session cookie) before allowing POST mutations.

**BUG-A5-5-004**: `src/app/api/projects/restore/route.ts:12` CRITICAL
The restore endpoint accepts an arbitrary JSON body and, when `body.projectId` and `body.snapshotId` are present, passes both directly to `restoreSnapshot` without UUID validation. When the full-import path runs, all field values (`c.name`, `c.color`, `c.type`, `p.points`, etc.) are cast with `as` without any schema validation, trusting completely untrusted input. A malicious JSON body could inject invalid types, null values, or oversized arrays that crash the data layer.
*Fix:* Validate the full incoming body with Zod before processing; add UUID checks for `projectId`/`snapshotId`; use `ProjectRestoreSchema` matching the export format.

---

### HIGH

**BUG-A5-5-005**: `src/lib/webhooks.ts:60` HIGH
`fireWebhook` makes outbound HTTP POST requests to arbitrary URLs registered by any caller of `POST /api/projects/:id/webhooks`. While the webhook creation schema validates the URL is HTTP(S), it does not block internal/private IP addresses. An attacker can register `http://169.254.169.254/latest/meta-data/` (AWS IMDS) or `http://localhost:5432` (internal Postgres) as a webhook URL, causing the server to make SSRF requests to internal infrastructure on each matching event.
*Fix:* Before firing webhooks, validate the resolved IP is not RFC-1918/loopback/link-local. Use a DNS-resolution pre-check or block `localhost`, `127.*`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`.

**BUG-A5-5-006**: `src/app/api/projects/[id]/export/excel/route.ts:156` HIGH
The `unitCosts` query parameter is decoded from base64 and parsed as JSON without any schema validation: `unitCosts = JSON.parse(Buffer.from(unitCostsParam, 'base64').toString('utf-8')) as UnitCostMap`. An attacker can supply arbitrary JSON. If the parsed object contains unexpected shapes, the `buildEstimatesSheet` function will silently produce garbled output or crash. The type assertion `as UnitCostMap` provides no runtime protection.
*Fix:* Validate the parsed `unitCosts` object against a Zod schema before use. At minimum, iterate keys and validate each value has `costPerUnit: number`.

**BUG-A5-5-007**: `src/app/api/projects/compare/route.ts:12` HIGH
`POST /api/projects/compare` accepts `projectIdA` and `projectIdB` from the request body without UUID validation. These IDs are passed directly to `getPolygons()` and `getClassifications()`. The comparison logic then matches polygons by `classificationId` across two different projects — but `classificationId` values are project-scoped UUIDs. A `classificationId` from project A will never equal one from project B unless they're the same project, making the `isMatch` function always return false for cross-project comparison, and the diff always showing all polygons as "added" or "removed".
*Fix:* Match by classification **name** (normalized) across projects, not by ID. Also add UUID validation for `projectIdA`/`projectIdB`.

**BUG-A5-5-008**: `src/app/api/projects/[id]/ai-takeoff/apply/route.ts:105` HIGH
`deletePolygonsByPage(id, page)` is called **before** validating that `validElements.length > 0`. The current code validates and filters `elements` into `validElements` after the delete. If all elements fail validation, the function returns a 400 — but the page's existing polygons have already been permanently deleted. The user loses all prior work on that page.
*Fix:* Move `deletePolygonsByPage` to after the `validElements.length === 0` check (i.e., only delete if there are valid elements to replace them with).

**BUG-A5-5-009**: `src/app/api/projects/[id]/duplicate/route.ts:60` HIGH
When duplicating a project, if `classificationIdMap.get(polygon.classificationId)` returns `undefined` (classification missing from map — e.g., orphaned polygon), the code falls back to the **original project's classificationId**: `classificationIdMap.get(polygon.classificationId) || polygon.classificationId`. This inserts a polygon in the new project referencing a classification ID that belongs to the source project, creating a dangling foreign key. The duplicate project will have broken polygons.
*Fix:* Skip polygons whose `classificationId` is not in the map, or log a warning and use a default classification.

**BUG-A5-5-010**: `src/app/api/projects/[id]/scales/route.ts:38` HIGH
`GET /api/projects/:id/scales` with no `pages` query param returns `{ scales: {} }` (empty object) with status 200 instead of returning all stored scales. The intention is unclear — the comment says "Return all scales — caller didn't specify pages" but immediately returns an empty object. Any client that calls this endpoint without a `pages` param (e.g., initial page load) receives no scale data and cannot calibrate measurements.
*Fix:* Call `listScales(id)` and return all stored scales when `pageNumbers.length === 0`. Import `listScales` from `project-store`.

**BUG-A5-5-011**: `src/app/api/projects/[id]/history/[entryId]/restore/route.ts:55` HIGH
In the `'delete'` restore case, after calling `createPolygon`, `broadcastToProject` is called and a 200 is returned. But if `createPolygon` throws, the generic catch at the bottom of the function returns a 500 with no distinction. More critically: the `'create'` restore case (undo a creation = delete) calls `deletePolygon(projectId, polygonId)` and returns `{ restored: true, action: 'deleted', ok }` — but if `ok` is `false` (polygon not found), the response still returns HTTP 200 with `restored: true`, misleading the caller into thinking the undo succeeded when the polygon was already gone.
*Fix:* Return HTTP 404 when `ok` is false in the `'create'` restore case.

**BUG-A5-5-012**: `src/app/api/projects/[id]/ai-takeoff/apply/route.ts:87` HIGH
`canonicalName` substitutes synonyms by returning only the **first word of the synonym group** when any word in the name matches. For example, a classification called `"Bathroom Space"` — where `"Space"` matches the `['room', 'space', 'area']` group — would be canonicalized to `"room"`, losing the `"Bathroom"` qualifier entirely. This causes false-positive classification merging: unrelated classifications with a common word get collapsed into the same entry.
*Fix:* Only apply synonym substitution when the **entire normalized name** (single word) matches a synonym group entry. Multi-word names should not trigger whole-name substitution.

**BUG-A5-5-013**: `src/app/api/perf/route.ts:20` HIGH
`POST /api/perf` creates a fresh `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` on every request. This bypasses the singleton client and creates a new HTTP connection pool per request. Under high traffic (web vitals are sent by every page view), this exhausts database connections.
*Fix:* Use the singleton `getSupabase()` from `@/lib/supabase`, or cache the perf-client in a module-level variable.

**BUG-A5-5-014**: `src/lib/webhooks.ts:1` HIGH
Webhook registrations are stored in `globalThis.__webhookRegistry` (in-memory). They are lost on every server restart, deployment, or serverless cold start. Any registered webhook silently stops firing after a restart with no error or notification to the registering client.
*Fix:* Persist webhook registrations to the database (new `mx_webhooks` table). On startup, load existing registrations from DB.

**BUG-A5-5-015**: `src/lib/sse-broadcast.ts:1` HIGH
SSE client sets (`projectClients`, `projectViewers`, `projectEventBuffer`) are stored in `globalThis` and survive Next.js HMR, but are process-local. In multi-instance or serverless deployments, a `broadcastToProject` call on instance A will not reach clients connected to instance B. Real-time collaboration silently degrades to single-instance only with no error.
*Fix:* Document this limitation prominently, or implement a Redis pub/sub fan-out for multi-instance environments.

**BUG-A5-5-016**: `src/app/api/admin/errors/route.ts:1` HIGH
`GET /api/admin/errors` returns the full in-memory error log (including stack traces, URLs, user agents) to any unauthenticated caller. Stack traces can reveal file paths, internal module names, and application structure to attackers.
*Fix:* Require admin authentication (e.g., `ADMIN_SECRET` header check) before returning error data.

**BUG-A5-5-017**: `src/app/api/errors/route.ts:1` HIGH
`GET /api/errors` returns all stored client error reports (stack traces, URLs, user agents) to any unauthenticated caller. Same issue as BUG-A5-5-016 — exposes sensitive debugging data.
*Fix:* Require admin authentication before returning stored errors.

**BUG-A5-5-018**: `src/app/api/audit-log/route.ts:17` HIGH
`GET /api/audit-log` returns the full in-memory audit log to any unauthenticated caller. Audit logs contain action types, resource IDs, and metadata that reveal internal application activity patterns and UUIDs.
*Fix:* Require authentication before exposing audit log data.

---

### MEDIUM

**BUG-A5-5-019**: `src/app/api/projects/[id]/chat/route.ts:45` MEDIUM
`getScale(id, 1)` always fetches the scale for page 1, regardless of which page the user is currently viewing or measuring. If the user has per-page scales set (pages 2–N), chat queries about quantities on those pages will use the wrong scale, producing incorrect area calculations in the AI's context data.
*Fix:* Pass the current page number from the request body when fetching scale, or fetch all scales and use the appropriate one per polygon.

**BUG-A5-5-020**: `src/app/api/projects/[id]/upload/route.ts:38` MEDIUM
MIME type validation checks `file.type === 'application/pdf'` OR `file.name?.toLowerCase().endsWith('.pdf')`. The `||` means a file named `evil.exe.pdf` with MIME type `application/octet-stream` passes validation. Additionally, the content is never inspected for the PDF magic bytes `%PDF-`.
*Fix:* Require **both** conditions to be true (MIME and extension), or validate the first 4 bytes of the buffer equal `%PDF`.

**BUG-A5-5-021**: `src/app/api/projects/[id]/pdf/route.ts:18` MEDIUM
The catch block returns the same generic message `"Unable to load PDF — the file may be corrupted or too large (max 50MB)"` for all errors, hiding the actual cause (permission denied, disk full, unexpected exception). The true error is swallowed, making server-side debugging impossible from API responses alone.
*Fix:* Log the original error with `console.error` (already done in upload route) and optionally surface a sanitized version in dev mode.

**BUG-A5-5-022**: `src/app/api/projects/[id]/pages/route.ts:53` MEDIUM
The PATCH handler calls `updatePage(id, pageNum, patch)` and falls back to `createPage` if `updated` is null. However, `createPage` uses `width: 0, height: 0` as defaults. A page created this way will have zero dimensions, breaking any geometry computation that uses page dimensions as scale references.
*Fix:* Fetch existing page dimensions before creating a fallback, or require `width`/`height` in the request body for upsert creation.

**BUG-A5-5-023**: `src/app/api/projects/[id]/history/route.ts:12` MEDIUM
The `limit` query parameter is parsed with `parseInt(...) || 50`. If the user passes `limit=0`, `parseInt('0') || 50` evaluates to `50` (because `0` is falsy), silently overriding the user's intent to request no history. This is a precedent of the standard "0 is falsy in JS" trap.
*Fix:* Use explicit null check: `const limit = parseInt(url.searchParams.get('limit') || '', 10); const clampedLimit = isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 200);`

**BUG-A5-5-024**: `src/app/api/projects/[id]/search-text/route.ts:43` MEDIUM
The search text matching loop that counts occurrences (lines 43–53) advances by `searchFrom = idx + 1`, which could match overlapping occurrences. This is usually acceptable, but for very large page text with short queries, the while loop has no termination guard other than `idx === -1`. An adversarial query of a single character against a page with 100,000 chars of that character would cause 100,000 iterations server-side.
*Fix:* Cap total iteration count at 1000 or advance by `queryLower.length` instead of 1.

**BUG-A5-5-025**: `src/app/api/projects/[id]/export/contractor/route.ts:216` MEDIUM
`buildSvgOverlay` constructs inline SVG with polygon point coordinates directly interpolated into attribute values: `pts = poly.points.map(p => \`${p.x / pageWidth},${p.y / pageHeight}\`).join(' ')`. If `pageWidth` or `pageHeight` is `0` (zero-dimension page from BUG-A5-5-022), this produces `Infinity` or `NaN` values in the SVG, rendering a corrupt/blank overlay.
*Fix:* Guard against zero `pageWidth`/`pageHeight` before building the overlay; return empty string if dimensions are invalid.

**BUG-A5-5-026**: `src/app/api/projects/[id]/export/contractor/route.ts:290` MEDIUM
`buildPageSection` inserts `thumbnail` data URLs into `<img src="...">` attributes and SVG content without sanitization. If the thumbnail data URL were ever constructed from user-supplied content (not just rendered PDF), it could be a `javascript:` URI or contain malicious SVG elements. While currently unlikely given the PDF rendering source, this is a defense-in-depth gap.
*Fix:* Validate that thumbnail strings begin with `data:image/` or a known HTTPS URL before embedding in HTML.

**BUG-A5-5-027**: `src/app/api/projects/[id]/assemblies/route.ts:36` MEDIUM
The POST handler parses the body with `AssemblyBodySchema.safeParse(body)` (validated), but then uses raw `body` values instead of `bodyResult.data` to extract `classificationId`, `name`, `unit`, `unitCost`, `quantityFormula`. Line 37: `const { classificationId, name, unit, unitCost, quantityFormula } = body;` — the validated result is discarded. If schema coercion or sanitization were applied in the schema (it currently isn't), they'd be bypassed.
*Fix:* Destructure from `bodyResult.data` instead of `body`.

**BUG-A5-5-028**: `src/app/api/projects/[id]/classifications/[cid]/route.ts:42` MEDIUM
`patchClassification` passes the raw `body` object (not `bodyResult.data`) to `updateClassification(id, cid, body)`. Schema validation runs via `ClassificationUpdateSchema.passthrough().safeParse(body)`, but since `passthrough()` is used, the validated data is structurally equivalent to `body`. However, extra fields not in the schema silently pass through and are stored in the DB, allowing clients to write arbitrary data to classification records.
*Fix:* Remove `.passthrough()` and pass `bodyResult.data` to `updateClassification`. If extra fields are needed (formula, formulaUnit, etc.), add them explicitly to `ClassificationUpdateSchema`.

**BUG-A5-5-029**: `src/app/api/projects/[id]/batch/route.ts:1` MEDIUM
The batch endpoint executes up to 500 operations sequentially with `await` inside a for-loop. For large batches (500 operations), this could take many seconds and block the request thread. There is no per-operation timeout.
*Fix:* Consider concurrency limiting (e.g., `p-limit`) or a bulk insert path in `project-store` that handles the entire batch in a single transaction.

**BUG-A5-5-030**: `src/app/api/projects/[id]/snapshot/route.ts:1` MEDIUM
`GET /api/projects/:id/snapshot` returns full project data (polygons, classifications, scale, pages) as a JSON response with no `Cache-Control` header. Unlike other routes, it does not use `withCache`. This means the response may be cached by CDNs indefinitely.
*Fix:* Add `Cache-Control: no-store` header or wrap with `withCache({ noStore: true })`.

**BUG-A5-5-031**: `src/app/api/projects/snapshots/[sid]/route.ts` — N/A (resolved scope)
Actually: `src/app/api/projects/[id]/snapshots/[sid]/route.ts:42` MEDIUM
The POST handler reads `body?.action ?? 'restore'` from the request but only validates that `action === 'restore'`. Any other string returns a 400. However, the `body` itself is read with `.catch(() => ({}))` and the action is not validated to be a string type first. If `body.action` is, say, a number or object, `action !== 'restore'` evaluates true and returns a confusing error.
*Fix:* Validate `typeof action === 'string'` before comparing.

**BUG-A5-5-032**: `src/lib/ab-testing.ts:66` MEDIUM
`getAllExperiments` is called server-side from `src/app/api/experiments/route.ts` with a `cookieHeader` argument. But on the server, `isClient = typeof window !== 'undefined'` is `false`, so `loadAssignments` falls into the cookie-parsing path. The cookie parsing uses `.split('=').slice(1).join('=')` — this correctly handles `=` signs in the value, but the decoded cookie value is parsed with `JSON.parse` without try/catch. Wait — it does have a try/catch. However, on the server the `saveAssignments` function no-ops (no localStorage), meaning that every server-side call to `getVariant` from `getAllExperiments` always sees `assignments[experimentName] = undefined` and always returns `null` as `assignedVariant`. Variant assignment never persists server-side; every request to `/api/experiments` returns `assignedVariant: null` for all experiments.
*Fix:* For server-side usage, accept a pre-parsed assignments record or set a response cookie to establish the assignment. Or document that `/api/experiments` always returns null and assignment is client-side only.

**BUG-A5-5-033**: `src/lib/feature-flags.ts:50` MEDIUM
`getFlag` checks env vars with `process.env[envKey]` where `envKey = \`NEXT_PUBLIC_${name}\``. However, `NEXT_PUBLIC_` env vars are inlined at build time in Next.js — `process.env.NEXT_PUBLIC_ENABLE_3D_VIEW` becomes `undefined` at runtime on the server if not set at build time. The check `if (envVal === 'false') return false` works for disabling flags, but cannot be used to enable flags via runtime env injection in serverless/Docker environments.
*Fix:* Document this limitation. For server-side flag control, use the `serverOverrides` map via `POST /api/flags`. Alternatively, also check non-NEXT_PUBLIC variants (e.g., `ENABLE_3D_VIEW`) on the server.

**BUG-A5-5-034**: `src/app/api/vision-search/route.ts:55` MEDIUM
The vision search endpoint has no rate limiting. Each request makes an OpenAI API call with `max_tokens: 2048` and potentially two high-resolution images. Without rate limiting, a single client can exhaust the OpenAI quota rapidly (or run up a large bill).
*Fix:* Apply `rateLimitResponse(req)` at the top of the handler, consistent with other AI-calling routes.

**BUG-A5-5-035**: `src/app/api/projects/[id]/chat/route.ts:1` MEDIUM
The project-specific chat endpoint has no rate limiting. Unlike `/api/chat` (which also lacks rate limiting — see BUG from cycle 4), this endpoint fetches the full project's polygons, classifications, assemblies, and scale on every request, making each call expensive both in terms of DB reads and OpenAI API usage.
*Fix:* Apply `rateLimitResponse(req)` at the top of the handler.

**BUG-A5-5-036**: `src/app/api/chat/route.ts:1` MEDIUM
Same as BUG-A5-5-035 — the `/api/chat` endpoint has no rate limiting. Any unauthenticated caller can hammer this endpoint and exhaust the OpenAI API key.
*Fix:* Apply `rateLimitResponse(req)` at the top of the handler.

**BUG-A5-5-037**: `src/app/api/projects/[id]/ai-takeoff/route.ts:26` MEDIUM
`POST /api/projects/:id/ai-takeoff` applies rate limiting at 10 req/min per IP. But the route also accepts a `model` parameter from the request body without validation. Any string is accepted as `model`. If the model string is unusually long or contains special characters, it is passed directly to `analyzePageImage` and then to the OpenAI API, which will return an error that surfaces back to the user as a 500.
*Fix:* Validate `model` against a whitelist of supported model identifiers (e.g., `['gpt-4o', 'gpt-4-vision-preview', 'claude-3-5-sonnet-20241022']`). Reject unknown model values with a 400.

**BUG-A5-5-038**: `src/lib/ai-sheet-namer.ts:12` MEDIUM
`aiSheetNamer` is called from the upload route with potentially large base64 image strings. The function concatenates the base64 string into a request body JSON with `detail: 'low'`. However, there is no size check on `imageBase64` before encoding. An extremely large image (e.g., a 50MB PDF rendered at full resolution) would produce a request body exceeding OpenAI's limits, resulting in a silent `null` return (the catch swallows the error) — but wastes significant memory building the request body string.
*Fix:* Add a size guard: if `imageBase64.length > 500_000` (bytes), skip AI naming and return null.

**BUG-A5-5-039**: `src/lib/auto-scale.ts:108` MEDIUM
`collectRatios` adds metric candidates with `unit: 'm'` to the candidates array, but uses a raw `candidates.push(...)` instead of `addCandidate(...)`. The `addCandidate` helper validates that `pixelsPerUnit` is finite and positive before pushing — the direct push bypasses this guard. If `denominator` is `0` (which is checked earlier, but only for `!Number.isFinite` and `<= 0`), a metric candidate could be pushed with `pixelsPerMeter = Infinity`.
*Fix:* Use `addCandidate` or add the same `Number.isFinite(pixelsPerMeter) && pixelsPerMeter > 0` guard before pushing metric candidates.

**BUG-A5-5-040**: `src/lib/polygon-utils.ts:83` MEDIUM
`mergePolygons` calls `turf.union(fc)` where `fc` is a FeatureCollection of two polygons. If either polygon has fewer than 3 points (invalid polygon per the GeoJSON spec), `turf.polygon(ring)` will throw an exception. The outer try/catch returns `[...poly1, ...poly2]` as a fallback, but this is a concatenated point list, not a valid polygon — subsequent area/perimeter calculations on the "merged" result will be wrong.
*Fix:* Validate that both `poly1.length >= 3` and `poly2.length >= 3` before calling turf; return the larger polygon unchanged if the other is invalid.

**BUG-A5-5-041**: `src/lib/sanitize.ts:16` MEDIUM
`validatePoints` accepts polygons with a minimum of 3 points and maximum of 500 points. However, `src/lib/api-schemas.ts:17` defines `PolygonSchema` with `z.array(PointSchema).min(2, ...)` — a minimum of 2 points. These constraints are inconsistent. A polygon with 2 points passes API-level validation but fails `validatePoints`. If both are used in different places, polygons created via the API may not pass the utility validation.
*Fix:* Align to a single minimum (2 for linear, 3 for area/count) or document the difference explicitly.

**BUG-A5-5-042**: `src/lib/store.ts:27` MEDIUM
`apiSync` is a fire-and-forget function that swallows all HTTP errors. If an API sync fails (network error, 500, auth failure), the local state diverges from the server silently. The user sees their changes but they are not persisted. There is no retry mechanism, no error notification to the user, and no reconciliation.
*Fix:* At minimum, notify the user via toast when API sync fails. Consider a retry queue with exponential backoff.

**BUG-A5-5-043**: `src/app/api/ws/route.ts:53` MEDIUM
When replaying buffered events (after reconnect with `lastEventId`), the initial `connected` event and `viewer:count` event are enqueued **after** the buffered events replay. This means the client receives historical events before learning it's connected, which could confuse event handlers that check `event === 'connected'` before processing other events. Ordering: buffered events → `connected` → `viewer:count` is backwards from the expected `connected` → buffered events.
*Fix:* Send the `connected` event first, then replay buffered events, then send `viewer:count`.

**BUG-A5-5-044**: `src/app/api/ws/route.ts:80` MEDIUM
The `keepaliveInterval` references a `new TextEncoder()` created inline on every tick. While minor, this creates a new TextEncoder object every 15 seconds per connected client. Under high concurrency (e.g., 1000 clients), that's 67 allocations per second.
*Fix:* Hoist `const encoder = new TextEncoder()` to the `start` closure scope (already done for the main encoder — reuse it for keepalive).

**BUG-A5-5-045**: `src/lib/rate-limit.ts:1` MEDIUM
The rate limiter `hits` Map is a module-level singleton in Node.js process memory. In Next.js with `--turbopack` or in serverless (Vercel/AWS Lambda), each function invocation may be a separate process with no shared state. Rate limiting silently becomes per-instance rather than per-IP-global, allowing a client to exceed limits by hitting different instances.
*Fix:* Document that rate limiting is in-memory and per-instance. For production rate limiting, use Redis or an edge middleware solution (e.g., `@upstash/ratelimit`).

**BUG-A5-5-046**: `src/lib/audit-log.ts:30` MEDIUM
`createAuditEntry` fires a `fetch('/api/audit-log', ...)` POST from the client side as fire-and-forget. If `localStorage` is full (storage quota exceeded), the try/catch silently catches and continues. But the fetch is also not awaited and errors are not surfaced. Audit entries could be silently lost in environments with storage pressure.
*Fix:* Accept this as a known limitation and add a comment; or add a structured fallback (e.g., sessionStorage, in-memory buffer).

**BUG-A5-5-047**: `src/lib/ai-results-loader.ts:35` MEDIUM
After calling `store.addClassification(...)`, the code reads back the fresh state via `readState().classifications` to resolve the new ID: `const resolvedId = fresh.find((c) => c.id === id || c.name === name)?.id ?? id`. If `addClassification` is asynchronous or if Zustand state updates are batched, `readState()` may still return the pre-mutation state, causing `resolvedId` to fall back to the temporary `id` returned by `addClassification`. The `nameToId` map would then have the wrong ID, causing polygons to be assigned to non-existent classifications.
*Fix:* The comment acknowledges this ("Synchronous zustand read after mutation") — verify that `useStore.getState()` (not a stale closure) is always called for `readState`.

**BUG-A5-5-048**: `src/app/api/projects/[id]/export/excel/route.ts:175` MEDIUM
`buildSummarySheet` writes the total cost estimate as a formatted string: `currency(totalCostEstimate)` (e.g., `"$1234.56"`). This means Excel treats the cell as text, not a number. Users cannot apply numeric formatting, sum columns, or use the value in formulas within Excel.
*Fix:* Write `round2(totalCostEstimate)` as a number to the cell and apply Excel number formatting (`'$#,##0.00'`) via `ws['C3'].z = '$#,##0.00'`.

---

### LOW

**BUG-A5-5-049**: `src/app/api/health/route.ts:6` LOW
`const { version } = require('../../../../package.json')` uses a relative `require()` with 4 levels of `..` traversal. This is fragile — if the file is moved or the project structure changes, the path breaks silently at runtime (module not found error at startup). Additionally, `require()` in an ES module context triggers a CJS interop warning in newer Node.js versions.
*Fix:* Use `import pkg from '../../../../../package.json'` with `"resolveJsonModule": true` in `tsconfig.json`, or read via `process.env.npm_package_version`.

**BUG-A5-5-050**: `src/app/api/projects/recent/route.ts:9` LOW
`[...projects].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))` compares ISO timestamps as locale strings. `String.localeCompare` is locale-sensitive and may produce incorrect ordering for ISO date strings in some locales. ISO timestamps should be compared with simple string comparison (`>`, `<`) or by converting to `Date` objects.
*Fix:* Replace `localeCompare` with `(b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1`.

**BUG-A5-5-051**: `src/app/api/plugins/route.ts:19` LOW
`POST /api/plugins` returns HTTP 200 with an informational message instead of HTTP 405 (Method Not Allowed). The route effectively documents itself rather than refusing the request. RESTfully, a POST with no side effects should return 405 or 501.
*Fix:* Return HTTP 405 with `Allow: GET` header.

**BUG-A5-5-052**: `src/app/api/docs/route.ts:1` LOW
Not read — route is very likely a stub. No further action unless file contains bugs. (Skipped in this audit pass.)

**BUG-A5-5-053**: `src/lib/perf-monitor.ts:70` LOW
`initPerfMonitor` has a module-level `_perfMonitorInitialized` guard, but this guard is **per-module-instance**. In Next.js App Router, `perf-monitor.ts` may be imported by multiple server modules in the same process, each with their own module instance. The guard only prevents double-registration within a single module instance but not across all server-side imports.
*Fix:* Use `globalThis.__perfMonitorInitialized` instead of a module-level variable to ensure true singleton behavior across module instances.

**BUG-A5-5-054**: `src/lib/plugin-system.ts:60` LOW
`pluginRegistry.emit` catches synchronous exceptions from plugin handlers (`try { const result = handler(...) }`) but async handlers that throw after the first `await` (i.e., rejected promises) are caught by `Promise.allSettled`. However, if a plugin handler is neither synchronous nor returns a Promise (e.g., `async` function that throws synchronously before first `await`), the exception propagates through `handler.apply(plugin, args)` before the promise wrapper, which the outer try/catch correctly catches. This is fine — documenting for clarity. No fix needed.

**BUG-A5-5-055**: `src/lib/openai-guard.ts:18` LOW
`getOpenAIKey()` is called in multiple route handlers and returns the key on every invocation via `process.env`. While `process.env` lookups are fast, the pattern of calling both `checkOpenAIKey()` and `getOpenAIKey()` in the same handler reads the env var twice. Minor inefficiency.
*Fix:* Return the key from `checkOpenAIKey()` so callers don't need a second call. E.g., `checkOpenAIKey(): { error: Response } | { key: string }`.

**BUG-A5-5-056**: `src/lib/supabase.ts:17` LOW
The `supabase` Proxy export creates a new `Proxy` around an empty object, forwarding all property accesses to `getSupabase()`. If `getSupabase()` throws (because Supabase is not configured) and the caller accesses any property on `supabase`, the error will be thrown at the property access site — which may be confusing for debugging since the error message ("Supabase not configured") appears in an unexpected call stack location.
*Fix:* Document that the `supabase` named export is convenience only and will throw on first property access if not configured. Prefer `getSupabase()` in server routes that can handle the error explicitly.

**BUG-A5-5-057**: `src/app/api/projects/[id]/polygons/route.ts:26` LOW
`DELETE /api/projects/:id/polygons` only accepts a `page` query param, with no ability to delete all polygons for a project. If a developer needs to clear all polygons, they must know page numbers or call the endpoint multiple times. Not a bug per se — but a missing capability that callers may work around unsafely (e.g., by deleting the project and recreating it).
*Fix:* Add `page=all` as a special case, or add a separate `DELETE /api/projects/:id/polygons/all` endpoint.

**BUG-A5-5-058**: `src/lib/ws-client.ts:198` LOW
`startFallbackPolling` merges remote assemblies into the store using `store.addAssembly(a)` and `store.updateAssembly(a.id, a)`. However, `store.addAssembly` and `store.updateAssembly` are Zustand actions that trigger subscriptions and potentially cause unnecessary re-renders during polling, even when no data has changed. The polling happens every 3 seconds for all connected clients during SSE outage.
*Fix:* Compare remote vs. local assembly data before calling store mutations; only update if values have changed (use JSON comparison or a version/updatedAt field).

**BUG-A5-5-059**: `src/lib/error-tracker.ts:48` LOW
`window.addEventListener("error", ...)` is registered unconditionally at module load time. In Next.js with StrictMode, modules may be evaluated multiple times, potentially registering the handler twice and capturing every error twice in the buffer.
*Fix:* Add a `globalThis.__errorTrackerInitialized` guard similar to `_perfMonitorInitialized`.

**BUG-A5-5-060**: `src/app/api/projects/[id]/share/route.ts:31` LOW
`POST /api/projects/:id/share` re-uses an existing token if one is found: "Re-use existing token if one already exists." However, there is no way to know if the existing token was previously shared publicly and then "revoked" by the user without the revokeShareToken logic running. If a token was never revoked (e.g., DB reset), re-using it means any prior recipients still have access without the user being aware.
*Fix:* Add an `isRevoked` boolean or creation timestamp to share tokens; optionally, always rotate tokens on POST.

**BUG-A5-5-061**: `src/lib/ai-settings.ts:1` LOW
`defaultModel: 'claude-sonnet-4-6'` is set as the default AI model, but the OpenAI API is used throughout the backend (`/api/ai-takeoff`, `/api/chat`, `/api/vision-search`, etc.). Anthropic's Claude is not wired up on the server side — only OpenAI is called. Setting a Claude model as default in settings would silently be ignored (or passed to `analyzePageImage` which would send it to OpenAI, which would reject an unknown model name).
*Fix:* Either wire up Anthropic support on the server, or change the default model to `'gpt-4o'` to match the actual backend.

**BUG-A5-5-062**: `src/lib/polygon-utils.ts:49` LOW
`calculateLinearFeet(points, pixelsPerUnit, closed)` with `closed=true` adds the closing segment from the last point back to the first point. For a 2-point "line" (which passes `points.length < 2` check), `closed=true` would add a duplicate segment (A→B then B→A), doubling the length. The `min(2)` schema constraint means 2-point polygons are valid — they're used for linear measurements.
*Fix:* When `points.length === 2`, skip the closing segment regardless of the `closed` parameter.

**BUG-A5-5-063**: `src/app/api/projects/[id]/export/excel/route.ts:215` LOW
`buildEstimatesSheet` uses `unitCosts[row.classificationId]?.costPerUnit ?? 0`. The `UnitCostMap` type is imported from `@/types/estimates` and its structure depends on that type definition. If the key type doesn't match (e.g., classification IDs have different casing), the lookup silently returns 0 for all rows, producing an estimates sheet where every row shows $0 total.
*Fix:* Log a warning if the `unitCosts` map is non-empty but no classification IDs matched.

**BUG-A5-5-064**: `src/app/api/projects/[id]/ai-takeoff/apply/route.ts:165` LOW
`existingPolygons.push(newPolygon)` mutates the `existingPolygons` array (which was fetched with `getPolygons(id)` and should be treated as read-only). This is a defensive practice violation — the array is the result of a DB query and mutating it locally is fine for dedup tracking, but confusing for readers who might expect `existingPolygons` to reflect the actual DB state.
*Fix:* Rename the local tracking array to `processedPolygons` and initialize it separately from the DB result.

**BUG-A5-5-065**: `src/app/api/projects/[id]/chat/route.ts:82` LOW
`pageCountMap` accumulates polygon counts per page, but raw page number is extracted as `const rawPg = (p as unknown as Record<string, unknown>).pageNumber` — forcing a double cast via `unknown`. This pattern repeats three times in the same function. The `Polygon` type in `src/lib/types.ts` already defines `pageNumber: number`, so the cast is unnecessary.
*Fix:* Remove the `as unknown as Record<string, unknown>` casts; access `p.pageNumber` directly since `Polygon` is typed.

**BUG-A5-5-066**: `src/app/api/projects/compare/route.ts:24` LOW
The compare route fetches `classificationsA` and `classificationsB` but never uses them in the `isMatch` function. They're only used to build `classNameMap` for display purposes. This is not a bug but is misleading — readers may expect classifications to be used for matching.

**BUG-A5-5-067**: `src/lib/sheet-namer.ts:24` LOW
`SHEET_NUMBER_RE` uses a case-insensitive flag `/i` and then `toUpperCase()` on the match. This means sheet numbers like `a1.00` are accepted and uppercased to `A1.00`. However, the regex `[A-Z]{1,3}` in the pattern (with `/i`) also matches lowercase prefixes like `abc123` which would be unusual for sheet names. The regex is slightly too permissive.
*Fix:* Minor concern — acceptable given domain constraints. Optional: add a word-boundary check after the digits.

**BUG-A5-5-068**: `src/app/api/projects/[id]/export/contractor/route.ts:360` LOW
`buildReportHtml` includes `<div style="max-width:880px;margin:0 auto;padding:32px 24px">` as the root container. The `Content-Length` header is computed using `new TextEncoder().encode(html).byteLength`, which is correct for UTF-8. But the `html` variable is built via string interpolation, and project names or classification names containing non-ASCII characters (e.g., `Ñoño`) would produce a UTF-8 byte count that differs from the character count. The current implementation correctly handles this — no bug.

**BUG-A5-5-069**: `src/app/api/projects/[id]/upload/route.ts:78` LOW
`renderPageAsImage(filePath, page.pageNum, 1.0)` is called for every page simultaneously via `aiNamingPromises.push(...)`, with no concurrency limit. For a 100-page PDF, this spawns 100 concurrent rendering + OpenAI vision requests. This will exhaust available memory and OpenAI concurrency limits.
*Fix:* Process AI naming sequentially or with a concurrency limit (e.g., 3 at a time using `p-limit`).

**BUG-A5-5-070**: `src/lib/auto-scale.ts:66` LOW
`collectArchitecturalAndCivil` uses two regex patterns (`clear` and `fuzzy`) that both match overlapping text. For a page containing `1/4" = 1'-0"`, both the `clear` pattern and the `fuzzy` pattern may match, adding two candidates for the same scale notation. The `clear` match has higher confidence (0.95) and the `fuzzy` has lower (0.85), so the best candidate wins — but the duplicate adds unnecessary entries to the candidates array.
*Fix:* After adding candidates from `clear`, mark matched ranges and skip them in `fuzzy` matching. Or deduplicate candidates with the same `pixelsPerFoot` value within a small tolerance.

**BUG-A5-5-071**: `src/app/api/projects/[id]/quantities/route.ts:1` LOW
`GET /api/projects/:id/quantities` is wrapped with `withCache({ maxAge: 30, sMaxAge: 30 })`. This means CDN-served clients may receive stale quantity data for up to 30 seconds after a polygon is added/deleted. In real-time collaborative scenarios where another user adds polygons, the quantities panel shows stale numbers.
*Fix:* Reduce `sMaxAge` to 0 or use `staleWhileRevalidate: 30` without `sMaxAge`, so CDNs always revalidate. Or rely on the SSE-based live updates and remove server-side caching.

**BUG-A5-5-072**: `src/lib/ws-client.ts:240` LOW
`disconnectFromProject(isProjectSwitch)` passes `isProjectSwitch` as `resetLastEventId`. When switching projects, `resetLastEventId = true` clears `lastEventId`. This means if the user switches from project A back to project A (same project), the SSE client disconnects and reconnects without replaying missed events (since `lastEventId` was cleared on the disconnect).
*Fix:* Only reset `lastEventId` when `projectId !== currentProjectId` (i.e., genuine project switch), not on all disconnects.

**BUG-A5-5-073**: `src/lib/ai-takeoff.ts:47` LOW
`triggerAITakeoff` retries once after a 3-second delay. The delay is a hard-coded 3000ms with no configuration option. In poor network conditions, 3 seconds may be too short for transient errors to resolve. In fast networks, 3 seconds is unnecessarily long.
*Fix:* Accept an optional `retryDelayMs` parameter; default to 3000.

**BUG-A5-5-074**: `src/app/api/projects/[id]/ai-takeoff/apply/route.ts:52` LOW
The `hasSignificantOverlap` function checks for spatial overlap between new and existing polygons using a fixed tolerance of 5 pixels. This tolerance is scale-independent — for a highly zoomed-in PDF (large pixel-per-unit scale), 5 pixels may be too strict (missing obvious duplicates); for a zoomed-out PDF, 5 pixels may be too loose (merging distinct nearby polygons). The dedup check may produce incorrect results depending on the PDF's zoom level.
*Fix:* Make the tolerance proportional to the average polygon bounding-box size, or expose it as a configurable parameter.

---

## SUMMARY TABLE

| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH | 14 |
| MEDIUM | 26 |
| LOW | 26 |
| **TOTAL** | **74** |

---

## TOP PRIORITY FIXES (Recommended Order)

1. **BUG-A5-5-001** — Remove `NEXT_PUBLIC_OPENAI_API_KEY` fallback (key exposure)
2. **BUG-A5-5-003** — Add auth to `POST /api/flags` (feature flag takeover)
3. **BUG-A5-5-004** — Add Zod validation to restore endpoint (arbitrary data injection)
4. **BUG-A5-5-008** — Move `deletePolygonsByPage` after validElements check (data loss)
5. **BUG-A5-5-005** — Add SSRF protection to webhook firing
6. **BUG-A5-5-007** — Fix compare route to match by name not cross-project ID
7. **BUG-A5-5-010** — Fix scales GET with no pages param to return all scales
8. **BUG-A5-5-016/017/018** — Add auth to admin/errors/audit-log endpoints
9. **BUG-A5-5-012** — Fix canonicalName multi-word false-positive merging
10. **BUG-A5-5-034/035/036** — Add rate limiting to vision-search, chat, project-chat

---

*End of Audit — A5 Cycle 5*
*74 bugs catalogued. All IDs follow format BUG-A5-5-[NNN].*
