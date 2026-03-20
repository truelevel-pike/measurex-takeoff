# MASTER BUG LIST — CYCLE 6 (FINAL CYCLE)

**Compiled:** 2026-03-20 18:26 UTC  
**Admirals:** A5, A6, A7, A8  
**Total Bugs:** 68  
**Critical:** 5  
**High:** 14  
**Medium:** 27  
**Low:** 22  

---

## ⚠️ CRITICAL SECURITY BUGS (5)

### BUG-A5-6-004: `/api/perf/summary` — Admin Key Leak + RLS Bypass
**File:** `src/app/api/perf/summary/route.ts:7`  
**Impact:** Any anonymous user reads `mx_perf_events` with admin privileges  
**Fix:** Use `SUPABASE_ANON_KEY` + require auth

### BUG-A5-6-008: `/api/perf` — Silent Data Loss on Missing Env
**File:** `src/app/api/perf/route.ts:32`  
**Impact:** Metrics lost silently when env vars undefined  
**Fix:** Remove non-null assertions, validate env vars at startup

### BUG-A5-6-011: `/api/perf` — Admin Key Write Access
**File:** `src/app/api/perf/route.ts:31`  
**Impact:** Anonymous users write to DB with admin privileges  
**Fix:** Use anon key + require auth

### BUG-A5-6-022: `/api/flags` — Unauthenticated Feature Toggle
**File:** `src/app/api/flags/route.ts:8`  
**Impact:** Anyone can toggle any feature flag  
**Fix:** Require admin authentication

### BUG-A7-5-001: DrawingSetManager — Zero Persistence
**File:** `src/components/DrawingSetManager.tsx:49-55`  
**Impact:** All drawing sets/drawings lost on every reload  
**Fix:** Wire to store + API endpoints

---

## 🚨 HIGH SEVERITY BUGS (14)

### Authentication Bypass Issues
- **BUG-A5-6-013:** `/api/projects/[id]/duplicate` — No auth, anyone duplicates any project
- **BUG-A5-6-016:** `/api/projects/[id]/history` — No auth, read any project history
- **BUG-A8-5-001:** `src/app/page.tsx:548` — localStorage projectId injection without validation

### Data Access Issues
- **BUG-A5-6-012:** `/api/image-search` — Access any project by guessing UUID
- **BUG-A5-6-018:** `/api/errors` — Read all error logs without auth
- **BUG-A5-6-024:** `/api/projects/[id]/snapshot` — Export any project data
- **BUG-A5-6-025:** `/api/projects/[id]/snapshots` — List any project's snapshots
- **BUG-A5-6-026:** `/api/projects/[id]/snapshots/[sid]` — Create/restore snapshots without auth
- **BUG-A5-6-031:** `/api/audit-log` — Read full audit log without auth

### UI/UX Issues
- **BUG-A6-5-001:** ActivityFeed — Broken downloads from premature URL revocation
- **BUG-A6-5-002:** AssembliesPanel — Stale closure drops assembly creations
- **BUG-A7-5-002:** DrawingSetManager — Archive button permanently deletes data
- **BUG-A7-5-003:** DrawingSetManager — `window.prompt()` blocks UI, fails in iframes

---

## MEDIUM SEVERITY BUGS (27)

**API Security:**
- BUG-A5-6-001, 005, 007, 009, 010 — Various auth/rate limiting issues
- BUG-A5-6-003, 006, 014, 015, 029 — Data exposure, integrity issues
- BUG-A8-5-002, 003, 004, 007, 008, 009 — Input validation, race conditions

**Component Issues:**
- BUG-A6-5-003-005, 007-037 — Various UI bugs, memory leaks, performance issues
- BUG-A7-5-004-015 — Feature flag caching, undo issues, missing validation

**Infrastructure:**
- BUG-A8-5-010-021 — Page navigation, persistence, error handling

---

## LOW SEVERITY BUGS (22)

Various UI refinements, edge cases, performance optimizations, and code quality issues across all sectors.

---

## CYCLE 6 STATUS: READY FOR FIX WAVE

All 4 admirals have completed audits. 68 bugs identified. Proceeding with fix dispatch to all admirals.

**Next Steps:**
1. Dispatch fix instructions to all 4 admirals
2. Monitor git activity for fix commits
3. Run build verification when all fixes complete
4. Final build check → mark cycle complete