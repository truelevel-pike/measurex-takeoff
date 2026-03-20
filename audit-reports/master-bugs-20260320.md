# MASTER BUG LIST — MEASUREX AUDIT 2026-03-20
**Date:** 2026-03-20 10:12 UTC  
**Total Bugs Found:** 114  
**Status:** Ready for fix wave dispatch  

---

## 🔴 CRITICAL (7 bugs)

### A5 Sector (Master Audit - 2026-03-18)
- **C1** Path traversal risk - unvalidated `id` param in API routes
- **C2** Path traversal in PDF reads - unsanitized `id` in filesystem path  
- **C3** Store mutations never sync to API - data loss on reload

### A6 Sector (Components)
- **BUG-A6-001** AutoNameTool hooks violation - React errors in production
- **BUG-A6-002** ClassificationLibrary setState-during-render - StrictMode crash risk

### A7 Sector (Core Tools)
- **BUG-A7-002** CutTool coordinate space bug - cut always fails silently
- **BUG-A7-014** Three.js geometry memory leak in FloorAreaMesh

### A8 Sector (Pages + Infrastructure)
- **BUG-A8-001** Share page overwrites global store - unsaved work lost
- **BUG-A8-002** Share export error handling - corrupt downloads on auth failure
- **BUG-A8-003** Overly permissive CSP - allows any host connections

---

## 🟠 HIGH (35 bugs)

### A5 Sector (20 HIGH bugs)
- DrawingTool snap settings ignored, linear measurements broken
- CanvasOverlay vertex drag doesn't recompute measurements
- API routes return wrong status codes, missing validation
- Store undo history excludes key data (groups, assemblies, markups)
- Page navigation uses stale scale values
- Missing multi-scale, batch operations, estimate endpoints

### A6 Sector (9 HIGH bugs)
- Memory leaks in DrawingSetManager, AssembliesPanel, CollaborationPanel
- AIActivityLog non-reactive store reads (stale colors)
- ClassificationGroups broken reorder UI (dead code)
- QuantitiesPanel fragile setTimeout workaround
- window.confirm() blocks main thread (3 components)

### A7 Sector (6 HIGH bugs)
- setScale race condition on undo stack
- SSE stale snapshots in message handlers
- Fallback polling captures stale projectId
- Vertex drag handler re-fires on polygon changes
- AI takeoff offscreen canvas memory leak
- Turf unit mismatch in splitPolygonByLine

### A8 Sector (11 HIGH bugs)
- Share page sets global projectId - cross-contamination risk
- Print page localStorage failures in partitioned contexts
- Library page missing error handling
- RLS policies allow any user to modify any group
- Anonymous users have full assemblies table access
- CSP allows blob: scripts - XSS vector
- Outdated xlsx package with known vulnerabilities

---

## 🟡 MEDIUM (52 bugs across all sectors)

Key issues include:
- Missing useEffect cleanups and dependency arrays
- Index-as-key React reconciliation issues (20+ instances)
- SSR-unsafe window.location accesses
- Feature flag cache never refreshes
- Service worker caching strategy issues
- Missing migration rollback scripts
- Accessibility gaps (missing aria-labels)
- Hydration mismatches in date rendering

---

## 🔵 LOW (20 bugs)

- Minor UX improvements needed
- Code style and documentation gaps
- Performance optimization opportunities
- Missing PWA icons and metadata

---

## PRIORITY FIX ORDER

1. **CRITICAL first** - Fix all 7 critical bugs (data loss, security, memory leaks)
2. **HIGH memory leaks** - Address the 6 memory leak bugs across A6/A7
3. **API security** - Fix path traversal and auth issues in A5/A8
4. **React stability** - Resolve hooks violations and setState patterns
5. **Coordinate space bugs** - Fix CutTool and measurement calculations
6. **Service worker** - Improve caching and cache invalidation

---

## FIX WAVE STATUS

**A5 (Master):** Ready - 3 critical, 20 high, 19 medium, 6 low  
**A6 (Components):** Ready - 2 critical, 9 high, 17 medium, 17 low  
**A7 (Core Tools):** Ready - 2 critical, 6 high, 7 medium, 3 low  
**A8 (Infrastructure):** Ready - 3 critical, 11 high, 13 medium, 7 low  

**Total:** 114 bugs identified and prioritized  
**Next:** Dispatch fix wave to all 4 admirals with their sector-specific bugs