#!/usr/bin/env bash
# MeasureX E2E Test Suite using browser-use CLI
# Run: bash scripts/e2e-browser-use.sh
# Prerequisites: npm run dev running, browser-use installed

export PATH="$HOME/.browser-use-env/bin:$HOME/.local/bin:$PATH"
BASE="http://localhost:3000"
PASS=0
FAIL=0
ERRORS=()

pass() { echo "  ✅ $1"; ((PASS++)); }
fail() { echo "  ❌ $1"; ((FAIL++)); ERRORS+=("$1"); }
section() { echo ""; echo "━━ $1 ━━"; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MeasureX E2E — browser-use CLI"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Server health ──
section "1. Server Health"
STATUS=$(curl -sL "$BASE/api/projects" -o /dev/null -w "%{http_code}")
[ "$STATUS" = "200" ] && pass "API responds 200" || fail "API unreachable ($STATUS)"

# ── 2. Browser loads projects page ──
section "2. Projects Page"
browser-use open "$BASE/projects" 2>/dev/null; sleep 4
STATE=$(browser-use state 2>/dev/null)
echo "$STATE" | grep -q "MeasureX" && pass "MeasureX branding visible" || fail "MeasureX not found"
echo "$STATE" | grep -q "New Project" && pass "'New Project' button present" || fail "'New Project' missing"
echo "$STATE" | grep -q "All Projects" && pass "Projects list visible" || fail "Projects list missing"

# ── 3. Create project via JS eval ──
section "3. Create Project"
PROJ_NAME="E2E-$(date +%s)"
# Click New Project
browser-use eval "document.querySelector('button[aria-label=\"New Project\"]')?.click() ?? Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New Project')?.click()" 2>/dev/null
sleep 2
# Type name
browser-use eval "const inp = document.querySelector('input[aria-label=\"Project name\"]'); if(inp){inp.focus(); inp.value='$PROJ_NAME'; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); 'typed'}" 2>/dev/null
sleep 1
# Click Create
browser-use eval "const btn = document.querySelector('button[aria-label=\"Create project\"]'); btn?.click(); btn?.disabled ? 'disabled' : 'clicked'" 2>/dev/null
sleep 4
STATE=$(browser-use state 2>/dev/null)
echo "$STATE" | grep -q "MEASUREX\|TAKEOFF ENGINE\|classifications" && pass "Project created, editor opened" || fail "Project creation failed"

# ── 4. Add classification ──
section "4. Add Classification"
browser-use eval "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('New Classification'))?.click()" 2>/dev/null
sleep 2
browser-use eval "const inp = document.querySelector('input[aria-label=\"Classification name\"]'); if(inp){inp.focus(); inp.value='Floor Area'; inp.dispatchEvent(new Event('input',{bubbles:true})); 'ok'}" 2>/dev/null
sleep 1
browser-use eval "const sel = document.querySelector('select[aria-label=\"Classification type\"]'); if(sel){sel.value='area'; sel.dispatchEvent(new Event('change',{bubbles:true})); 'ok'}" 2>/dev/null
sleep 1
browser-use eval "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Create')?.click()" 2>/dev/null
sleep 2
STATE=$(browser-use state 2>/dev/null)
echo "$STATE" | grep -q "Floor Area" && pass "Classification 'Floor Area' created" || fail "Classification not created"

# ── 5. Screenshot ──
section "5. Screenshot"
SHOT="/tmp/measurex-e2e-$(date +%s).png"
browser-use screenshot "$SHOT" 2>/dev/null
[ -f "$SHOT" ] && pass "Screenshot: $SHOT" || fail "Screenshot failed"

# ── 6. API verify ──
section "6. API Verification"
PROJ_ID=$(curl -sL "$BASE/api/projects" 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    projs=[p for p in d.get('projects',[]) if p.get('name','').startswith('E2E-')]
    print(projs[0]['id'] if projs else '')
except: print('')
")

if [ -n "$PROJ_ID" ]; then
    pass "Project found via API: ${PROJ_ID:0:8}..."
    CLS=$(curl -sL "$BASE/api/projects/$PROJ_ID/classifications" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('classifications',[])))" 2>/dev/null)
    [ "${CLS:-0}" -ge "1" ] && pass "Classification persisted ($CLS)" || fail "Classification missing in API"
    curl -sL -X DELETE "$BASE/api/projects/$PROJ_ID" -o /dev/null && pass "Cleanup done"
else
    fail "Project not found via API"
fi

browser-use close 2>/dev/null

# ── Summary ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS+FAIL))
echo "  $PASS/$TOTAL passed"
[ ${#ERRORS[@]} -gt 0 ] && for e in "${ERRORS[@]}"; do echo "  ❌ $e"; done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
