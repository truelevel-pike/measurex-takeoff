#!/usr/bin/env bash
# Verifies all required data-testid / testId / id attributes exist in MeasureX source
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

# Check for exact data-testid="X"
check() {
  local id="$1"
  if grep -r "data-testid=\"${id}\"" "$REPO_ROOT/src" --include='*.tsx' -q 2>/dev/null; then
    echo "✅ $id"
  else
    echo "❌ MISSING: $id"
    FAILED=1
  fi
}

# Check for prop form: testId="X" (rendered as data-testid by NavIconButton etc.)
check_prop() {
  local id="$1"
  if grep -r "testId=\"${id}\"" "$REPO_ROOT/src" --include='*.tsx' -q 2>/dev/null; then
    echo "✅ $id (testId prop)"
  else
    echo "❌ MISSING: $id (testId prop)"
    FAILED=1
  fi
}

# Check for id="X" (agent state span uses id=, not data-testid=)
check_id() {
  local id="$1"
  if grep -r "id=\"${id}\"" "$REPO_ROOT/src" --include='*.tsx' -q 2>/dev/null; then
    echo "✅ $id (id attr)"
  else
    echo "❌ MISSING: $id (id attr)"
    FAILED=1
  fi
}

# Check for dynamic testid pattern (e.g. tool-${tool.tool})
check_dynamic() {
  local pattern="$1"
  local label="$2"
  if grep -r "${pattern}" "$REPO_ROOT/src" --include='*.tsx' -q 2>/dev/null; then
    echo "✅ $label (dynamic testid pattern: ${pattern})"
  else
    echo "❌ MISSING: $label (dynamic testid pattern: ${pattern})"
    FAILED=1
  fi
}

# Check for a string literal anywhere in source (covers ternary/computed testids)
check_literal() {
  local id="$1"
  if grep -r "'${id}'" "$REPO_ROOT/src" --include='*.tsx' -q 2>/dev/null || \
     grep -r "\"${id}\"" "$REPO_ROOT/src" --include='*.tsx' -q 2>/dev/null; then
    echo "✅ $id (string literal)"
  else
    echo "❌ MISSING: $id (string literal)"
    FAILED=1
  fi
}

echo '=== MeasureX Agent Testid Verification ==='

# Dynamic tool testids (rendered as tool-select, tool-draw, tool-pan, etc.)
check_dynamic 'tool-\${' 'tool-select/draw/pan/merge/split/cut (dynamic)'

# Undo/redo: set via ternary expression — grep for the string literal
check_literal 'tool-undo'
check_literal 'tool-redo'
check 'zoom-in-btn'
check 'zoom-out-btn'
check 'zoom-fit-btn'
check_literal 'scale-display'
check 'new-classification-btn'
check 'classification-name-input'
check 'classification-type-select'
check 'save-classification-btn'
check 'retogal-btn'
check 'polygon-label'
check 'coord-input-panel'
check 'coord-input-field'
check 'coord-input-submit'
check 'canvas-area'

# testId prop form (rendered as data-testid by NavIconButton)
check_prop 'page-prev-btn'
check_prop 'page-next-btn'

# data-testid= form for page-number-display
check 'page-number-display'

# id= form for agent state span
check_id 'mx-agent-state'

echo ''
[ "$FAILED" -eq 0 ] && echo 'ALL TESTIDS PRESENT ✅' || echo "MISSING TESTIDS: $FAILED ❌"
exit $FAILED
