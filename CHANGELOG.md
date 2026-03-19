# Changelog

All notable changes to MeasureX Takeoff are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Wave 11] — 2026-03-18

### Added
- Storybook stories for QuantitiesPanel (Empty, Loaded, Loading states)
- Storybook stories for PDFViewer (Upload, Loaded states)
- Storybook stories for Toast (Success, Error, Info variants)
- Project README with structure, env setup, test commands, and Vercel deploy guide
- This CHANGELOG

## [Wave 10] — 2026-03-18

### Fixed
- CanvasOverlay performance — memoized callbacks to prevent unnecessary re-renders
- Jest config `setupFilesAfterSetup` typo corrected

## [Wave 9] — 2026-03-17

### Fixed
- Accessibility: ARIA labels and roles across interactive components
- Performance: `useMemo`/`useCallback` optimizations in hot paths
- Broken ActivityFeed / useRealtimeSync imports resolved

### Changed
- Dynamic imports for ThreeDScene, ComparePanel, and downloadExcel to reduce initial bundle size

## [Wave 8] — 2026-03-16

### Added
- Contractor report API route with Excel export
- Recent projects API endpoint
- Project duplication API
- OpenAPI 3.0 spec and AI Agent quick-start guide (`docs/`)
- Estimates tab with cost breakdown per classification
- Copy-link share button
- ProjectSettingsPanel (rename, units, delete)
- QuantitiesPanel keyboard navigation (arrow keys, Enter, Escape)
- Logger utility for server-side routes
- Jest testing infrastructure with unit tests for geometry, store, and utils
- E2E API test script for core takeoff workflow

### Fixed
- Missing ActivityFeed component and useRealtimeSync hook imports
- Code quality pass — removed dev `console.log`s, replaced `any` types with `unknown`

## [Wave 7] — 2026-03-14

### Added
- Image search UX with Google redirect
- Compare panel UI for side-by-side sheet comparison
- Undo/redo for annotations
- Multi-select polygons with bulk delete/reclassify actions
- Measurement precision settings — units, decimals, area/linear unit selector
- Print/PDF export with polygon overlays and CSS print styles
- Classification library for reusable classification templates
- Onboarding flow — scale calibration + AI takeoff steps
- Server-side sheet naming from PDF text extraction
- Mobile toolbar

### Fixed
- Toast stacking overlap

## [Wave 6] — 2026-03-12

### Added
- AnnotationTool component for text/arrow/cloud annotations
- Compare API route for sheet comparison
- PATCH support for classification updates
- Export JSON button in QuantitiesPanel header
- Export JSON API route with file download headers
- Projects sort control and VersionHistory polish
- Zoom controls UI and settings page improvements
- New project navigates immediately to takeoff view
- Project thumbnails — capture page 1 canvas, display on project card
- Project thumbnails on projects page with initials placeholder and color hash

### Fixed
- Geometry engine unit conversion updates

## [Wave 5] — 2026-03-10

### Added
- MX Chat with OpenAI integration
- Image search with Google redirect
- Keyboard shortcuts modal
- ReRunAI wiring for re-processing pages
- Drawing sets support
- Multi-page AI takeoff — "Run on All Pages" with progress tracking
- Scale calibration UX — auto-start, live preview, confirmation state
- Enhanced count classifications — presets, page breakdown, single-click placement

### Fixed
- Quantities count calculation (GAP-005)
- AI takeoff response mapping and null safety (GAP-002)
- 2D/3D view toggle wiring
- Snap page-scoping, vertex drag area recompute, Delete key polygon removal

## [Pre-Wave 5] — 2026-03-01 to 2026-03-09

### Added
- MeasureX v1.0 — complete takeoff application with 46+ components
- PDF viewer with pan/zoom, multi-page navigation, touch support
- Canvas overlay for polygon drawing (SVG-based)
- Classification CRUD with context menu
- Zustand store with localStorage persistence
- REST API layer — full CRUD for projects, classifications, polygons
- AI takeoff engine with server-side pipeline
- Excel export (.xlsx)
- SSE real-time sync between clients
- Supabase integration with migrations
- Scale calibration panel with line-draw mode
- Polygon labels on canvas
- Vertex drag to reshape polygons
- Assemblies cost linking with API-backed panel
- Revision history — mx_history table and VersionHistory UI
- Keyboard shortcuts (V/H/D/M/Esc/Ctrl+Z/Ctrl+Y)

### Fixed
- PDF viewer memory leaks, stale render issues, zoom anchor math
- SSE registry keepalive, exponential backoff reconnect
- Store data integrity fixes from multiple audits
- Path traversal sanitization in file routes
- Hydration issues and duplicate classification prevention
