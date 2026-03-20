# MASTER BUG LIST — CYCLE 3

**Date:** 2026-03-20
**Status:** Compiled from A5, A6, A7, A8 audit reports

---

## SUMMARY

| Sector | CRITICAL | HIGH | MEDIUM | LOW | TOTAL |
|--------|----------|------|--------|-----|-------|
| A5 (API/Backend) | 14 | 31 | 47 | 42 | 134 |
| A6 (Components) | 1 | 9 | 54 | 75 | 139 |
| A7 (Drawing/Stores) | 1 | 9 | 54 | 39 | 103 |
| A8 (Pages/Infra) | 9 | 53 | 56 | 37 | 155 |
| **TOTAL** | **25** | **102** | **211** | **193** | **531** |

---

## CRITICAL BUGS (25 total)

### A5 CRITICAL (14)
- BUG-A5-3-001: src/app/api/admin/errors/route.ts:7 — Auth bypass when ADMIN_KEY not set
- BUG-A5-3-004: src/app/api/ai-takeoff/route.ts:285 — No auth, unauthenticated AI calls
- BUG-A5-3-014: src/app/api/chat/route.ts:12 — No auth on chat endpoint
- BUG-A5-3-020: src/app/api/flags/route.ts:8 — No auth on feature flag toggle
- BUG-A5-3-120: src/app/api/projects/[id]/route.ts:122 — No auth on DELETE project
- BUG-A5-3-201: [assemblies, batch, chat, classifications, duplicate, estimates, export/*] — No auth on 11 routes
- BUG-A5-3-213: src/app/api/projects/[id]/chat/route.ts:189-201 — No rate limiting on OpenAI proxy
- BUG-A5-3-301: src/app/api/projects/[id]/webhooks/route.ts:16-64 — No try/catch, stack trace leak
- BUG-A5-3-302: src/app/api/projects/[id]/webhooks/route.ts:12 — SSRF vulnerability in URL validation
- BUG-A5-3-303: src/app/api/projects/[id]/webhooks/route.ts:46-63 — DELETE doesn't scope by project
- BUG-A5-3-304: src/app/api/projects/restore/route.ts:22-23 — No UUID validation on restore
- BUG-A5-3-305: src/app/api/projects/[id]/pdf/route.ts:21 — Buffer memory leak via ArrayBuffer cast
- BUG-A5-3-401: src/lib/webhooks.ts:70 — SSRF in fireWebhook, no URL validation

### A6 CRITICAL (1)
- BUG-A6-3-122: src/components/DrawingSetManager.tsx:219 — moveDrawing logic causes permanent data loss

### A7 CRITICAL (1)
- BUG-A7-3-201: src/components/FloorAreaMesh.tsx:94 — 3D geometry Z-mismatch, fill/outline mirrored

### A8 CRITICAL (9)
- BUG-A8-3-040: src/app/projects/page.tsx:1 — No authentication check
- BUG-A8-3-041: src/app/settings/page.tsx:1 — No authentication check
- BUG-A8-3-050: src/app/library/page.tsx:1 — No authentication check
- BUG-A8-3-061: src/app/share/[token]/page.tsx:60 — No token expiry check
- BUG-A8-3-105: package.json:28 — xlsx package has unpatched CVEs
- BUG-A8-3-121: supabase/migrations/000_bootstrap.sql:12 — _exec_sql SECURITY DEFINER no search_path
- BUG-A8-3-122: supabase/migrations/000_bootstrap.sql:12 — _exec_sql arbitrary SQL execution
- BUG-A8-3-136: supabase/migrations/009_complete_schema.sql:1 — RLS policies USING (true) = no security
- BUG-A8-3-145: supabase/migrations/016_assemblies_grants.sql:5 — GRANT ALL TO anon on assemblies
- BUG-A8-3-154: supabase/migrations/018_mx_groups_rls_fix.sql:20 — References non-existent owner_id

---

## HIGH PRIORITY BUGS (102 total)

### A5 HIGH (31 bugs)
- SSRF via Host header manipulation, no auth on audit-log, no rate limiting on chat, error info disclosure, no auth on image-search, perf events, project listing, AI takeoff endpoints, batch operations allowing 500 ops, prompt injection via unvalidated roles, unvalidated body fields, base64 deserialization without validation, and more.

### A6 HIGH (9 bugs)
- AssembliesPanel stale closure overwrites state, AutoNameTool Reject button empty handler, DuplicateProjectModal orphaned data on close, ScaleCalibrationPanel setTimeout fires after unmount, ThreeDScene missing error boundary, ThreeDViewer pdfTexture never disposed, ThreeDViewer Canvas missing error boundary, TogalChat SSE stream never cancelled, WallMesh ExtrudeGeometry never disposed.

### A7 HIGH (9 bugs)
- cutPolygon deletes instead of cutting, hydrateState leaks previous project data, setScaleForPage overwrites wrong page scale, getCoords returns {0,0} corrupting geometry, O(n×m) snap scan causing UI freeze, store mutation in state updater causes double undo/API calls, MergeSplitTool split preview broken, ThreeDScene subscribes to entire store, MarkupTools state disconnected.

### A8 HIGH (53 bugs)
- URL param injection without validation, localStorage injection, OpenAI API key stored in localStorage (XSS), API keys stored unmasked, CSP misconfiguration with wrong env vars, vulnerable next/flatted dependencies, no maxDuration on API routes, data migration corrupts text column, share tokens no expiry, mx_groups RLS tautologies, and many more.

---

## FIX WAVE DISPATCHED

Cycle 3 fix wave dispatched to all 4 admirals at 2026-03-20T16:15:00Z.

Admirals must:
1. Read their sector audit file
2. Fix CRITICAL first, then HIGH, then MEDIUM, then LOW
3. Commit each fix with message: fix(cycle3): BUG-[A5/A6/A7/A8]-3-[NNN] [description]
4. Write DONE to fix-status-[A5/A6/A7/A8]-cycle3.txt when complete

---

*Master list compiled by P.I.K.E. — 2026-03-20*
