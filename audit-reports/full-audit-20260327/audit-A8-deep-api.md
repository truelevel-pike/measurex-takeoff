# API Audit — MeasureX
**Auditor:** Admiral A8 (API Audit)
**Date:** 2026-03-27
**Source path:** `~/.openclaw/workspace-nate/measurex-takeoff/src/app/api/`

---

## 1. Endpoint Inventory

### Top-Level Routes (not project-scoped)

| Route | Methods | Status |
|---|---|---|
| `/api/ai-takeoff` | POST | ✅ EXISTS |
| `/api/agent/session` | GET | ✅ EXISTS |
| `/api/audit-log` | — | ✅ EXISTS |
| `/api/chat` | — | ✅ EXISTS |
| `/api/docs` | — | ✅ EXISTS |
| `/api/errors` | — | ✅ EXISTS |
| `/api/experiments` | — | ✅ EXISTS |
| `/api/feature-flags` | — | ✅ EXISTS |
| `/api/flags` | — | ✅ EXISTS |
| `/api/health` | — | ✅ EXISTS |
| `/api/image-search` | — | ✅ EXISTS |
| `/api/metrics` | — | ✅ EXISTS |
| `/api/openapi.json` | — | ✅ EXISTS |
| `/api/perf` | — | ✅ EXISTS |
| `/api/plugins` | — | ✅ EXISTS |
| `/api/projects` | GET, POST | ✅ EXISTS |
| `/api/share` | — | ✅ EXISTS |
| `/api/vision-search` | — | ✅ EXISTS |
| `/api/ws` | — | ✅ EXISTS |
| `/api/agent-webhook` | — | ❌ MISSING |

### Project-Scoped Routes (`/api/projects/[id]/...`)

| Route | Methods | Status |
|---|---|---|
| `/api/projects/[id]` | GET, PUT, PATCH, DELETE | ✅ EXISTS |
| `/api/projects/[id]/ai-takeoff` | — | ✅ EXISTS |
| `/api/projects/[id]/ai-takeoff/all-pages` | — | ✅ EXISTS |
| `/api/projects/[id]/ai-takeoff/apply` | — | ✅ EXISTS |
| `/api/projects/[id]/assemblies` | — | ✅ EXISTS |
| `/api/projects/[id]/assemblies/[aid]` | — | ✅ EXISTS |
| `/api/projects/[id]/batch` | POST | ✅ EXISTS |
| `/api/projects/[id]/chat` | — | ✅ EXISTS |
| `/api/projects/[id]/classifications` | GET, POST | ✅ EXISTS |
| `/api/projects/[id]/classifications/[cid]` | — | ✅ EXISTS |
| `/api/projects/[id]/duplicate` | — | ✅ EXISTS |
| `/api/projects/[id]/estimates` | — | ✅ EXISTS |
| `/api/projects/[id]/export/contractor` | — | ✅ EXISTS |
| `/api/projects/[id]/export/excel` | — | ✅ EXISTS |
| `/api/projects/[id]/export/json` | GET | ✅ EXISTS |
| `/api/projects/[id]/history` | — | ✅ EXISTS |
| `/api/projects/[id]/history/[entryId]/restore` | — | ✅ EXISTS |
| `/api/projects/[id]/pages` | — | ✅ EXISTS |
| `/api/projects/[id]/pages/[pageNum]/polygons` | — | ✅ EXISTS |
| `/api/projects/[id]/pdf` | — | ✅ EXISTS |
| `/api/projects/[id]/polygons` | GET, POST | ✅ EXISTS |
| `/api/projects/[id]/polygons/[pid]` | — | ✅ EXISTS |
| `/api/projects/[id]/quantities` | — | ✅ EXISTS |
| `/api/projects/[id]/scale` | — | ✅ EXISTS |
| `/api/projects/[id]/scale-preset` | — | ✅ EXISTS |
| `/api/projects/[id]/scales` | — | ✅ EXISTS |
| `/api/projects/[id]/search-text` | — | ✅ EXISTS |
| `/api/projects/[id]/share` | — | ✅ EXISTS |
| `/api/projects/[id]/snapshot` | — | ✅ EXISTS |
| `/api/projects/[id]/snapshots` | — | ✅ EXISTS |
| `/api/projects/[id]/snapshots/[sid]` | — | ✅ EXISTS |
| `/api/projects/[id]/upload` | — | ✅ EXISTS |
| `/api/projects/[id]/webhooks` | GET, POST | ✅ EXISTS |
| `/api/projects/[id]/webhooks/events` | GET | ✅ EXISTS |

---

## 2. Architecture Doc Requirements — Gap Check

The audit doc specified these **required endpoints**. Status against what was found:

| Required Endpoint | Actual Route | Status | Notes |
|---|---|---|---|
| `/api/agent-webhook` | — | ❌ MISSING | No route file found anywhere. See §3. |
| `/api/ai-takeoff` | `/api/ai-takeoff` | ✅ EXISTS | Full implementation with Gemini |
| `/api/export` | `/api/projects/[id]/export/{json,excel,contractor}` | ⚠️ PARTIAL | Export is project-scoped, not a top-level `/api/export`. No flat `/api/export` route exists. |
| `/api/projects` | `/api/projects` | ✅ EXISTS | GET (list) + POST (create) |
| `/api/classifications` | `/api/projects/[id]/classifications` | ⚠️ PARTIAL | Classifications are project-scoped only; no global `/api/classifications` route. |
| `/api/polygons` | `/api/projects/[id]/polygons` | ⚠️ PARTIAL | Same — polygons are project-scoped only. |

---

## 3. Missing: `/api/agent-webhook`

**Gap:** No `agent-webhook` route exists anywhere under `src/app/api/`.

The architecture doc describes this as the trigger endpoint — the human hits "Run Takeoff" and MeasureX calls the agent webhook to wake the OpenClaw agent. Without it, there is no server-side mechanism to initiate an agent takeoff session from the MeasureX UI.

**What exists instead:**
- `/api/agent/session` (GET) — returns machine-readable project state for an already-running agent. This is a *read* endpoint for the agent to poll, not a *trigger* endpoint.
- `/api/projects/[id]/webhooks` — allows registering external webhook URLs (outbound from MeasureX). Not the same as an inbound trigger.
- `/api/projects/[id]/webhooks/events` — event log for agents to poll.

**Impact:** The "Run Takeoff → wake agent" flow described in the architecture doc cannot complete. The agent can be manually pointed at a project URL, but there is no API endpoint for MeasureX to programmatically trigger an agent run.

---

## 4. `?agent=1` Handling

**Checked:** Grepped all `.ts` / `.tsx` files for `agent=1`, `agentMode`, `isAgent`, `searchParams.*agent`.

**Files referencing `?agent=1`:**
- `src/app/api/agent/session/route.ts` — constructs `agentUrl` with `?agent=1` appended (read path only, no enforcement)
- `src/app/agent/page.tsx` — documents the `?agent=1` contract; confirms `isTrusted` is NOT checked on canvas events (architecture requirement met)
- `src/app/page.tsx` — main canvas page; likely reads `?agent=1` to suppress modals
- `src/app/settings/page.tsx` — references agent mode
- `src/components/CoordInputPanel.tsx` — agent coordinate input
- `src/components/ReTogal.tsx` — re-takeoff trigger component

**Verdict:** `?agent=1` is handled in the frontend. The `agent/page.tsx` doc explicitly states canvas events do not check `isTrusted`. No API route enforces or reads `?agent=1` — it is purely a client-side concern, which is correct per the architecture.

---

## 5. `isTrusted` Check

**Finding:** No `event.isTrusted` check found in any canvas drawing handler. The `/agent` docs page at line 299 explicitly documents:

> "All canvas event handlers accept standard browser PointerEvents — no `isTrusted` check blocks agent input."

Architecture requirement satisfied.

---

## 6. Export Endpoint Discrepancy

The architecture doc lists `/api/export` as a required endpoint. What exists:

- `GET /api/projects/[id]/export/json` — full project data as JSON
- `POST /api/projects/[id]/export/excel` — Excel workbook with quantities and cost estimates
- `GET /api/projects/[id]/export/contractor` — contractor-formatted quantity report

All exports are project-scoped. There is no flat `/api/export` route. This is functionally correct (you need a project ID to export), but the naming diverges from the architecture doc. If an external system expects `POST /api/export`, it will 404.

---

## 7. Summary of Gaps

| # | Gap | Severity | File to Create |
|---|---|---|---|
| G1 | `/api/agent-webhook` missing | **HIGH** — agent trigger flow is broken | `src/app/api/agent-webhook/route.ts` |
| G2 | No global `/api/export` route | **LOW** — project-scoped exports work; naming mismatch only | `src/app/api/export/route.ts` (redirect or alias) |
| G3 | No global `/api/classifications` or `/api/polygons` | **LOW** — project-scoped equivalents exist and work | Could add if needed by external consumers |

---

## 8. What's Well-Implemented

- `GET /api/agent/session` — solid machine-readable project state summary for agent bootstrap
- Webhook system (`/webhooks`, `/webhooks/events`) — agent can poll events and receive outbound callbacks
- Batch endpoint (`/batch`) — prevents per-polygon rate-limit exhaustion during AI takeoff
- Rate limiting on all routes
- UUID validation on `projectId` params (prevents 500 on bad input)
- `?agent=1` modal suppression documented and implemented in frontend
- `isTrusted` not blocked — agent browser CDP clicks work
- Export: three formats (JSON, Excel, contractor report) are fully implemented
