#!/usr/bin/env bash
# Verifies all required data-testid attributes exist in MeasureX source
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0
check() {
  local id="$1"
  if grep -r "data-testid=\"${id}\"" "$REPO_ROOT/src" --include='*.tsx' -q 2>/dev/null; then
    echo "✅ $id"
  else
    echo "❌ MISSING: $id"
    FAILED=1
  fi
}
echo '=== MeasureX Agent Testid Verification ==='
check 'tool-select'
check 'tool-draw'
check 'tool-pan'
check 'tool-merge'
check 'tool-split'
check 'tool-cut'
check 'tool-undo'
check 'tool-redo'
check 'zoom-in-btn'
check 'zoom-out-btn'
check 'zoom-fit-btn'
check 'page-prev-btn'
check 'page-next-btn'
check 'page-number-display'
check 'scale-display'
check 'new-classification-btn'
check 'classification-name-input'
check 'classification-type-select'
check 'save-classification-btn'
check 'retogal-btn'
check 'polygon-label'
check 'coord-input-panel'
check 'coord-input-field'
check 'coord-input-submit'
check 'mx-agent-state'
echo ''
[ "$FAILED" -eq 0 ] && echo 'ALL TESTIDS PRESENT ✅' || echo "MISSING TESTIDS: $FAILED ❌"
exit $FAILED
