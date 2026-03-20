# MeasureX Master Bug List — Cycle 5
Generated: 2026-03-20T17:58:40Z

**Total bugs found: 289**

## ⛔ CRITICAL (fix first)
1. **Security** — OpenAI API key leaked via `NEXT_PUBLIC_` fallback (CRITICAL); share-token endpoint unauthenticated and exposes full project state; no auth on flag/admin mutation routes; webhook SSRF via localhost/internal IPs; base64-decoded JSON for unit costs parsed without validation.
2. **Data integrity** — compare route uses raw `classificationId` cross-project matching (meaningless without name correlation); AI apply route deletes existing polygons before validating the new batch; duplicate route silently falls back to wrong `classificationId` on FK mismatch; restore route accepts unvalidated user-supplied types with dangerous casts.
3. **In-memory state** — all registries (webhooks, SSE clients, error log, audit log, rate limiter, perf monitor) are server-process-global and lost on restart/redeploy; no persistence.
4. **Error handling** — several routes silently swallow errors and return stale/empty data instead of 500; PDF route hides true error behind a generic message.
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

| CRITICAL | 4 |
| HIGH | 14 |
| MEDIUM | 26 |
| LOW | 26 |
| CRITICAL | 0 |
| HIGH     | 7 |
| MEDIUM   | 18 |
| LOW      | 12 |
| CRITICAL | 1        | 0                     | —               |
| HIGH     | 3        | 0                     | 8               |
| MEDIUM   | 8        | 1                     | 10              |
| LOW      | 11       | 1                     | 14              |
## NEW CRITICAL BUG

### BUG-A7-5-001 (CRITICAL) — DrawingSetManager.tsx: all drawing set state is local-only, no persistence
**File:** src/components/DrawingSetManager.tsx:49–55  
**Description:** `DrawingSetManager` manages all drawing sets and drawings in local React
`useState`. There is zero API integration: no `fetch` calls to create/load/update/delete
1. **BUG-A7-5-001** — DrawingSetManager no persistence — all user data silently discarded (CRITICAL)
2. **BUG-A7-5-002** — Archive calls deleteDrawing — silent data loss (HIGH)
3. **BUG-A7-5-003** — renameDrawing uses window.prompt() — blocks UI, fails in iframes (HIGH)
4. **BUG-A7-5-004** — useFeatureFlag module cache not keyed by project — stale flags after switch (HIGH)
*Files read: 8. Total new findings: 23 (1 CRITICAL, 3 HIGH, 8 MEDIUM, 11 LOW) + 2 regressions + 14 confirmed cycle 4 fixes.*
| Confirmed Fixed from Cycle 4 (CRITICAL) | 3 |
| Confirmed Fixed from Cycle 4 (HIGH/MEDIUM) | 18 |
| Confirmed Fixed from Cycle 4 (LOW) | 4 |
| Still Open from Cycle 4 (MEDIUM) | 2 |
### 🔴 CRITICAL
None — all prior critical bugs confirmed fixed.

### 🟠 HIGH (fix this sprint)

## 🔴 HIGH
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
| HIGH | 14 |
| MEDIUM | 26 |
| LOW | 26 |
| HIGH     | 7 |
| MEDIUM   | 18 |
| LOW      | 12 |
| HIGH     | 3        | 0                     | 8               |
| MEDIUM   | 8        | 1                     | 10              |
| LOW      | 11       | 1                     | 14              |
## NEW HIGH BUGS

### BUG-A7-5-002 (HIGH) — DrawingSetManager.tsx: Archive action calls deleteDrawing — data loss
*Files read: 8. Total new findings: 23 (1 CRITICAL, 3 HIGH, 8 MEDIUM, 11 LOW) + 2 regressions + 14 confirmed cycle 4 fixes.*
### 🟠 HIGH (fix this sprint)
1. **BUG-A8-5-001** — OpenAI API key persisted in plaintext localStorage via `saveAiSettings`
2. **BUG-A8-5-002** — "Change Email" button has no handler
*Total new bugs: 20 (3 HIGH, 11 MEDIUM, 6 LOW)*  
*Total confirmed fixed since Cycle 1: 25 bugs*  
*Total open going into Cycle 6: 28 bugs*

## 🟡 SANDBOX BLOCKERS (from PRODUCT-VISION.md)
BLOCKER-001: X-Frame-Options: DENY in next.config.ts — blocks sandbox browser
BLOCKER-002: No frame-ancestors in CSP — sandbox cannot load app
BLOCKER-003: PDF export quality must match Togal output
