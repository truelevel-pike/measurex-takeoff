'use client';

// /agent — MeasureX Agent Mode Documentation
// This page documents the agent integration contract so an OpenClaw browser-control
// agent can bootstrap itself by reading /agent before starting a takeoff.

import Link from 'next/link';
import { ArrowLeft, Bot, Eye, Keyboard, Database, LayoutGrid, Zap } from 'lucide-react';

export default function AgentDocsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/projects" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <Bot size={22} className="text-[#00d4ff]" />
        <h1 className="text-xl font-bold text-[#00d4ff]">MeasureX — Agent Mode</h1>
        <span className="text-xs text-gray-500 border border-gray-700 rounded px-2 py-0.5 ml-2">
          Machine-readable reference
        </span>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-12">

        {/* Overview */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Zap size={16} className="text-[#00d4ff]" />
            What is Agent Mode?
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            MeasureX supports an OpenClaw browser-control agent as the primary takeoff operator.
            The agent opens this app in a real Chromium browser, takes screenshots to see blueprints,
            reads the DOM via snapshots, and uses CDP click events to draw polygons — exactly like a human estimator.
          </p>
          <p className="text-sm text-gray-400 leading-relaxed">
            To activate agent mode, append <code className="text-[#00d4ff] bg-gray-800 px-1.5 py-0.5 rounded">?agent=1</code> to any project URL.
            All modals, onboarding tooltips, and interrupting UI are automatically suppressed.
          </p>
        </section>

        {/* URL param */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <LayoutGrid size={16} className="text-[#00d4ff]" />
            URL Pattern
          </h2>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3 text-sm">
            <div className="flex items-start gap-4">
              <span className="text-gray-500 w-40 shrink-0">Project canvas</span>
              <code className="text-[#00d4ff]">/?project=&lt;id&gt;&amp;page=&lt;n&gt;&amp;agent=1</code>
            </div>
            <div className="flex items-start gap-4">
              <span className="text-gray-500 w-40 shrink-0">Project list</span>
              <code className="text-[#00d4ff]">/projects?agent=1</code>
            </div>
            <div className="flex items-start gap-4">
              <span className="text-gray-500 w-40 shrink-0">Agent state span</span>
              <code className="text-[#00d4ff]">&lt;span id=&quot;mx-agent-state&quot;&gt;</code>
            </div>
          </div>
        </section>

        {/* Agent state span */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Eye size={16} className="text-[#00d4ff]" />
            mx-agent-state Span
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            When <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">?agent=1</code> is active, a hidden span
            is injected into the page with live state as JSON data attributes. The agent reads this via DOM snapshot
            to get current app state without a screenshot.
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-sm text-gray-300 space-y-2">
            <pre className="text-xs text-[#00d4ff] overflow-x-auto leading-relaxed">{`<span
  id="mx-agent-state"
  hidden
  data-page="2"
  data-total-pages="7"
  data-tool="draw"
  data-selected-classification="abc123"
  data-polygon-count="14"
  data-scale-px-per-unit="47.2"
  data-scale-unit="ft"
/>`}</pre>
          </div>
        </section>

        {/* data-testids */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Database size={16} className="text-[#00d4ff]" />
            data-testid Reference
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            All interactive elements expose stable <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">data-testid</code> attributes.
            The agent uses these via browser snapshot for reliable DOM refs without brittle CSS selectors.
          </p>

          {/* Canvas */}
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2 mt-6">Canvas</h3>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden text-xs">
            {[
              ['canvas-area', 'Main drawing canvas element — click here to place polygon points'],
              ['canvas-container', 'Wrapper div around the canvas (for coordinate context)'],
            ].map(([id, desc]) => (
              <div key={id} className="flex items-start gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
                <code className="text-[#00d4ff] w-52 shrink-0">{id}</code>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2 mt-6">Toolbar / Tools</h3>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden text-xs">
            {[
              ['tool-select', 'Select / pointer tool button (V key)'],
              ['tool-area', 'Draw area polygon tool button'],
              ['tool-linear', 'Draw linear measurement tool button'],
              ['tool-count', 'Draw count / marker tool button'],
              ['tool-pan', 'Pan / hand tool button (H key)'],
              ['tool-measure', 'Measure tool button (M key)'],
              ['zoom-in-btn', 'Zoom in button'],
              ['zoom-out-btn', 'Zoom out button'],
              ['fit-page-btn', 'Fit to page button (F key)'],
            ].map(([id, desc]) => (
              <div key={id} className="flex items-start gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
                <code className="text-[#00d4ff] w-52 shrink-0">{id}</code>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>

          {/* Page navigation */}
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2 mt-6">Page Navigation</h3>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden text-xs">
            {[
              ['page-prev-btn', 'Navigate to previous page'],
              ['page-next-btn', 'Navigate to next page'],
              ['page-number-display', 'Current page number display (read text to know current page)'],
              ['scale-display', 'Scale label (e.g. 1/4" = 1\')'],
            ].map(([id, desc]) => (
              <div key={id} className="flex items-start gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
                <code className="text-[#00d4ff] w-52 shrink-0">{id}</code>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>

          {/* Classifications */}
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2 mt-6">Classifications</h3>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden text-xs">
            {[
              ['new-classification-btn', 'Open "create classification" dialog'],
              ['classification-name-input', 'Name input in the classification form'],
              ['classification-type-select', 'Type dropdown (area / linear / count)'],
              ['classification-color-picker', 'Color picker for the classification'],
              ['save-classification-btn', 'Save / confirm classification creation'],
            ].map(([id, desc]) => (
              <div key={id} className="flex items-start gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
                <code className="text-[#00d4ff] w-52 shrink-0">{id}</code>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>

          {/* Quantities + Export */}
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2 mt-6">Quantities &amp; Export</h3>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden text-xs">
            {[
              ['quantities-panel', 'Quantities side panel — read polygon SF labels from here'],
              ['export-btn', 'Open export panel button'],
              ['export-excel-btn', 'Export Excel (Screen View) button inside export panel'],
              ['export-pdf-btn', 'Export PDF / Print button inside export panel'],
              ['export-json-btn', 'Export JSON button inside export panel'],
              ['export-csv-btn', 'Export CSV coordinates button inside export panel'],
              ['export-panel-close', 'Close the export panel'],
              ['polygon-label', 'SF / LF / count label on a completed polygon (data-polygon-id attr)'],
            ].map(([id, desc]) => (
              <div key={id} className="flex items-start gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
                <code className="text-[#00d4ff] w-52 shrink-0">{id}</code>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>

          {/* CoordInputPanel */}
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2 mt-6">CoordInputPanel (agent precision mode)</h3>
          <p className="text-xs text-gray-500 mb-3">
            When <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">?agent=1</code> is active and the draw tool is selected,
            a coordinate input panel appears. The agent can type x,y pairs directly instead of clicking the canvas pixel-by-pixel.
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden text-xs">
            {[
              ['coord-input-panel', 'Wrapper for the coordinate input panel'],
              ['coord-input-textarea', 'Textarea — paste x,y pairs one per line'],
              ['coord-submit-btn', 'Create polygon from typed coordinates'],
              ['coord-clear-btn', 'Clear the coordinate input'],
            ].map(([id, desc]) => (
              <div key={id} className="flex items-start gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
                <code className="text-[#00d4ff] w-52 shrink-0">{id}</code>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>

          {/* Upload */}
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2 mt-6">Upload</h3>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden text-xs">
            {[
              ['upload-pdf-input', 'Hidden file input — set files via CDP to trigger upload'],
              ['upload-drop-zone', 'Drag-and-drop zone for PDF upload'],
            ].map(([id, desc]) => (
              <div key={id} className="flex items-start gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
                <code className="text-[#00d4ff] w-52 shrink-0">{id}</code>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Keyboard shortcuts */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Keyboard size={16} className="text-[#00d4ff]" />
            Keyboard Shortcuts (machine-readable)
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            A hidden div with <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">id=mx-keyboard-shortcuts</code> is present in the DOM at all times.
            The agent reads data attributes to know which keys do what, without needing a screenshot.
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-xs">
            <pre className="text-[#00d4ff] overflow-x-auto leading-relaxed">{`<div
  id="mx-keyboard-shortcuts"
  hidden
  data-r="rectangle"
  data-d="draw"
  data-v="select"
  data-h="pan"
  data-g="merge"
  data-s="split"
  data-c="cut"
  data-m="measure"
  data-a="ai-takeoff"
  data-f="fit-page"
  data-escape="cancel"
  data-enter="confirm"
/>`}</pre>
          </div>
        </section>

        {/* /api/agent/session */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Database size={16} className="text-[#00d4ff]" />
            /api/agent/session Endpoint
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Returns current project state as JSON — useful for the agent to verify quantities or check page count
            without reading the DOM.
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4 text-xs">
            <div>
              <span className="text-gray-500">GET</span>{' '}
              <code className="text-[#00d4ff]">/api/agent/session?projectId=&lt;id&gt;</code>
            </div>
            <div>
              <span className="text-gray-500 block mb-2">Response:</span>
              <pre className="text-gray-300 overflow-x-auto leading-relaxed">{`{
  "projectId": "abc123",
  "totalPages": 7,
  "currentPage": 2,
  "scale": { "pixelsPerUnit": 47.2, "unit": "ft" },
  "classifications": [...],
  "polygonCount": 14,
  "agentMode": true
}`}</pre>
            </div>
          </div>
        </section>

        {/* Drawing contract */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Bot size={16} className="text-[#00d4ff]" />
            Drawing Contract
          </h2>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3 text-sm text-gray-300">
            <p>1. Press <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">R</code> for rectangle tool, or click the tool button.</p>
            <p>2. Click canvas points via <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">browser act(click, selector=&quot;[data-testid=&apos;canvas-area&apos;]&quot;, x, y)</code>.</p>
            <p>3. Double-click the first point, or press <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">Enter</code> to close the polygon.</p>
            <p>4. A <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">data-testid=&quot;polygon-label&quot;</code> div appears with the measurement.</p>
            <p>5. Press <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">Escape</code> to cancel drawing at any time.</p>
            <p className="text-gray-500 text-xs pt-2">
              All canvas event handlers accept standard browser PointerEvents — no <code>isTrusted</code> check blocks agent input.
            </p>
          </div>
        </section>

        {/* JavaScript Automation API */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Zap size={16} className="text-[#00d4ff]" />
            JavaScript Automation API — <code className="text-[#00d4ff] text-base">window.measurex</code>
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            When <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">?agent=1</code> is active,{' '}
            <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">window.measurex</code> is injected and provides
            direct store access. Use via{' '}
            <code className="text-[#00d4ff] bg-gray-800 px-1 rounded">browser act(kind=&quot;evaluate&quot;, fn=&quot;...&quot;)</code>.
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-5 text-xs">

            <div>
              <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide text-[10px]">Read state</p>
              <pre className="text-[#00d4ff] overflow-x-auto leading-relaxed">{`window.measurex.getState()
// → { currentPage, totalPages, scale, selectedClassification, polygonCount, classificationCount }

window.measurex.getTotals()
// → { totalAreaSF, totalLF, totalCount }

window.measurex.getPolygons()       // → Polygon[]
window.measurex.getClassifications() // → Classification[]`}</pre>
            </div>

            <div>
              <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide text-[10px]">Navigation &amp; scale</p>
              <pre className="text-[#00d4ff] overflow-x-auto leading-relaxed">{`window.measurex.setPage(3)
// Navigate to page 3 (1-based). Also update PDF viewer via keyboard or URL.

window.measurex.setScale({ pixelsPerUnit: 47.2, unit: 'ft' })
// Apply scale to current page. unit: 'ft' | 'in' | 'm' | 'mm' | 'cm'`}</pre>
            </div>

            <div>
              <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide text-[10px]">Classifications &amp; polygons</p>
              <pre className="text-[#00d4ff] overflow-x-auto leading-relaxed">{`window.measurex.selectClassification('abc-uuid')
// Set active classification for the next drawn polygon.

window.measurex.selectPolygon('polygon-uuid')
// Highlight / select a polygon in the canvas.

window.measurex.reclassify('polygon-uuid', 'New Room Name')
// Move polygon to a classification by name (creates it if missing).

window.measurex.clearPage(2)
// Delete all polygons on page 2.`}</pre>
            </div>

            <div>
              <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide text-[10px]">Typical agent flow (evaluate calls)</p>
              <pre className="text-gray-300 overflow-x-auto leading-relaxed">{`// 1. Get current state
const s = window.measurex.getState();
// s.currentPage, s.totalPages, s.scale.pixelsPerUnit ...

// 2. Select classification before drawing
window.measurex.selectClassification(s.selectedClassification);

// 3. After drawing, verify
const t = window.measurex.getTotals();
// t.totalAreaSF, t.totalLF, t.totalCount

// 4. Navigate to next page
window.measurex.setPage(s.currentPage + 1);`}</pre>
            </div>

          </div>
        </section>

        {/* Footer nav */}
        <div className="border-t border-gray-800 pt-8 flex gap-6 text-sm">
          <Link href="/settings" className="text-[#00d4ff] hover:underline">← Settings</Link>
          <Link href="/projects" className="text-[#00d4ff] hover:underline">Projects</Link>
          <a href="/api/agent/session" target="_blank" rel="noopener noreferrer" className="text-[#00d4ff] hover:underline">
            /api/agent/session ↗
          </a>
        </div>
      </div>
    </div>
  );
}
