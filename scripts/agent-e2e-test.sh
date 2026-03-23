#!/usr/bin/env bash
# MeasureX Agent E2E Test — Wave 9
# Static code checks: verifies agent readiness without running a server.
# Usage: ./scripts/agent-e2e-test.sh [repo_root]
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"

PASS=0; FAIL=0
declare -a ROWS

pass_check() {
  local name="$1" detail="${2:-}"
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-52s | ✅ PASS' "$name")")
  echo "  ✅ $name${detail:+ — $detail}"
}

fail_check() {
  local name="$1" detail="${2:-}"
  FAIL=$(( FAIL + 1 ))
  ROWS+=("$(printf '%-52s | ❌ FAIL' "$name")")
  echo "  ❌ $name${detail:+ — $detail}"
}

check_grep() {
  local name="$1" pattern="$2" file="$3"
  if grep -qE "$pattern" "$ROOT/$file" 2>/dev/null; then
    pass_check "$name"
  else
    fail_check "$name" "not found in $file"
  fi
}

check_file() {
  local name="$1" path="$2"
  if [ -f "$ROOT/$path" ] || [ -d "$ROOT/$path" ]; then
    pass_check "$name" "$path"
  else
    fail_check "$name" "missing: $path"
  fi
}

echo "=== MeasureX Agent E2E Code Checks ==="
echo "Repo: $ROOT"
echo ""

# ── 1. Required data-testids in codebase ───────────────────────────────
echo "── data-testids ──"
check_grep "data-testid: coord-input-panel"    'data-testid="coord-input-panel"'    "src/components/CoordInputPanel.tsx"
check_grep "data-testid: coord-input-field"    'data-testid="coord-input-field"'    "src/components/CoordInputPanel.tsx"
check_grep "data-testid: coord-input-submit"   'data-testid="coord-input-submit"'   "src/components/CoordInputPanel.tsx"
check_grep "data-testid: tool-area"            "tool-area"                          "src/components/CoordInputPanel.tsx"
check_grep "data-testid: tool-linear"          "tool-linear"                        "src/components/CoordInputPanel.tsx"
check_grep "data-testid: tool-count"           "tool-count"                         "src/components/CoordInputPanel.tsx"
check_grep "data-testid: canvas-area"          'data-testid="canvas-area"'          "src/components/PDFViewer.tsx"
echo ""

# ── 2. agentMode guards on modals ──────────────────────────────────────
echo "── agentMode modal suppression ──"
check_grep "agentMode suppresses WhatsNew"         '!agentMode.*WhatsNew|WhatsNew.*agentMode'              "src/app/page.tsx"
check_grep "agentMode suppresses FirstRunTooltips" '!agentMode.*FirstRunTooltips|FirstRunTooltips.*agentMode' "src/app/page.tsx"
check_grep "agentMode suppresses ScaleCalibration" '!agentMode.*ScaleCalibration|ScaleCalibration.*agentMode' "src/app/page.tsx"
check_grep "agentMode suppresses autoScalePopup"   '!agentMode.*showAutoScalePopup|showAutoScalePopup.*!agentMode' "src/app/page.tsx"
check_grep "agentMode suppresses ContextMenu"      '!agentMode.*menuState|menuState.*!agentMode'           "src/app/page.tsx"
echo ""

# ── 3. window.measurex — no NODE_ENV guard ─────────────────────────────
echo "── window.measurex ──"
if grep -q "NODE_ENV.*development" "$ROOT/src/lib/measurex-api.ts" 2>/dev/null; then
  fail_check "measurex-api: no NODE_ENV guard" "guard still present — remove it"
else
  pass_check "measurex-api: no NODE_ENV guard"
fi
check_grep "measurex: setPage method"    'setPage'    "src/lib/measurex-api.ts"
check_grep "measurex: setScale method"   'setScale'   "src/lib/measurex-api.ts"
check_grep "measurex: getState method"   'getState'   "src/lib/measurex-api.ts"
check_grep "measurex: getTotals method"  'getTotals'  "src/lib/measurex-api.ts"
check_grep "measurex: clearPage method"  'clearPage'  "src/lib/measurex-api.ts"
echo ""

# ── 4. API routes ──────────────────────────────────────────────────────
echo "── API routes ──"
check_file "/api/agent/session route"        "src/app/api/agent/session/route.ts"
check_file "/api/projects/[id]/scale-preset" "src/app/api/projects/[id]/scale-preset/route.ts"
check_file "/api/projects/[id]/upload"       "src/app/api/projects/[id]/upload/route.ts"
check_file "/api/projects/[id]/polygons"     "src/app/api/projects/[id]/polygons/route.ts"
check_file "/api/projects/[id]/scale"        "src/app/api/projects/[id]/scale/route.ts"
echo ""

# ── 5. mx-agent-state span ─────────────────────────────────────────────
echo "── mx-agent-state ──"
check_grep "mx-agent-state span in page.tsx"        'mx-agent-state'              "src/app/page.tsx"
check_grep "mx-agent-state: data-current-page"      'data-current-page'           "src/app/page.tsx"
check_grep "mx-agent-state: data-total-pages"       'data-total-pages'            "src/app/page.tsx"
check_grep "mx-agent-state: data-polygon-count"     'data-polygon-count'          "src/app/page.tsx"
check_grep "mx-agent-state: data-scale-px-per-unit" 'data-scale-px-per-unit'      "src/app/page.tsx"
echo ""

# ── 6. CoordInputPanel type quick-select testids ──────────────────────
echo "── CoordInputPanel type testids ──"
check_grep "CoordInputPanel mounted in page.tsx" 'CoordInputPanel' "src/app/page.tsx"
check_grep "CoordInputPanel: tool-area testid"   'tool-area'       "src/components/CoordInputPanel.tsx"
check_grep "CoordInputPanel: tool-linear testid" 'tool-linear'     "src/components/CoordInputPanel.tsx"
check_grep "CoordInputPanel: tool-count testid"  'tool-count'      "src/components/CoordInputPanel.tsx"
echo ""

# ── SUMMARY ────────────────────────────────────────────────────────────
echo "================================================================"
echo " Check                                               | Result"
echo "-----------------------------------------------------+----------"
for row in "${ROWS[@]}"; do echo " $row"; done
echo "================================================================"
TOTAL=$(( PASS + FAIL ))
echo " Total: $TOTAL  ✅ $PASS passed  ❌ $FAIL failed"
echo "================================================================"
echo ""

[ "$FAIL" -eq 0 ] && echo "ALL AGENT CODE CHECKS PASSED ✅" && exit 0
echo "AGENT CODE CHECKS FAILED ❌ ($FAIL/$TOTAL checks failed)"
exit 1
