# MISSION: MeasureX → Full Togal Feature Parity

## Objective
Transform MeasureX into a production-grade Togal clone that an OpenClaw agent can operate autonomously for construction takeoffs. Every feature Togal has, MeasureX must have.

## North Star
An OpenClaw agent opens MeasureX, uploads a PDF, and does a complete takeoff for a 7-page house plan — producing accurate SF, LF, and counts, all visible with labels — without any human intervention.

## Phase 1: Agent-Readiness (PRIORITY)
1. Audit ALL interactive elements — add data-testid to every button, input, canvas, panel
2. Add ?agent=1 mode — suppress all modals, tooltips, onboarding, popups
3. Verify SF labels always visible on every polygon
4. Canvas must accept standard PointerEvents (no isTrusted blocking)
5. Stable canvas coordinate contract documented
6. CDP interaction test suite — verify all draw tools work

## Phase 2: Feature Gaps (Core)
1. Auto-naming sheets from title blocks on upload
2. Pattern Search (find repeated symbols across pages)
3. AI Image Search improvements (draw box → find matches across all sheets)
4. Drawing Comparison (compare two revisions, quantify changes)
5. Merge tool (fill gaps between polygons)
6. Split tool (divide polygon in two)
7. Cut/subtract tool (remove area from polygon)
8. Smart paste
9. Flip, rotate, combine polygons
10. Arc line tool
11. Circle shortcut (C key)
12. Snapping (automatic edge snap + toggle)
13. Wall centerline auto-detection
14. Door/window backout from wall linear measurements
15. Multi-select classifications

## Phase 3: Assemblies & Costs
1. Link classifications to materials + costs
2. Material library (reusable)
3. Custom formulas (Excel-like syntax)
4. Assembly export
5. Prebuilt templates for common wall types

## Phase 4: Collaboration & Polish
1. Multi-user real-time editing
2. External collaboration (no license needed, permission levels)
3. Organization-level classification library
4. Version history
5. ServiceTitan integration

## Acceptance Criteria
- npm run build passes with 0 errors
- All existing tests pass
- New features have data-testid attributes
- Agent can operate all new features via browser control
- No regressions on existing functionality

## Hard Rules
- NEVER break the build — if build fails, fix immediately before continuing
- NEVER remove existing functionality
- All changes must be committed with descriptive messages
- Test after every feature addition
- Admirals on Codex 5.3 — NEVER change model
