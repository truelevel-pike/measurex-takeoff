# CYCLE 2 MASTER AUDIT REPORT
**Date:** 2026-03-20
**Cycle:** 2
**Status:** Ready for Fix Wave

## 🔴 CRITICAL BUGS (9 total)

### A5 Sector - API + Backend (3 critical)
- **BUG-A5-C1:** Path traversal risk - unvalidated `id` param in API routes
- **BUG-A5-C2:** Path traversal in PDF reads - unsanitized `id` in filesystem path  
- **BUG-A5-C3:** Store mutations never sync to API - data loss on reload

### A6 Sector - Components (2 critical)
- **BUG-A6-001:** AutoNameTool hooks violation - React errors in production
- **BUG-A6-002:** ClassificationLibrary setState-during-render - StrictMode crash risk

### A7 Sector - Drawing Tools (2 critical)
- **BUG-A7-002:** CutTool coordinate space bug - cut always fails silently
- **BUG-A7-014:** Three.js geometry memory leak in FloorAreaMesh

### A8 Sector - Pages + Infra (2 critical)
- **BUG-A8-001:** Share page overwrites global store - unsaved work lost
- **BUG-A8-002:** Share export error handling - corrupt downloads on auth failure

## 🟠 HIGH BUGS (35 total)

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

## TOTAL BUG COUNT: 44 CRITICAL + HIGH priority fixes required

## Fix Instructions
1. Start with ALL CRITICAL bugs (9 total)
2. Then fix HIGH bugs (35 total)  
3. Each fix must include proper error handling
4. No band-aids - fix root causes only
5. Commit each fix with message format: `fix(cycle2): BUG-[A5/A6/A7/A8]-[NNN] [description]`