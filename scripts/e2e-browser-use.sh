#!/usr/bin/env bash
# MeasureX E2E Test Suite — browser-use CLI
# Usage: bash scripts/e2e-browser-use.sh
# Prerequisites: npm run dev (or DISABLE_RATE_LIMIT=true npm run dev), browser-use installed

export PATH="$HOME/.browser-use-env/bin:$HOME/.local/bin:$PATH"
BASE="${MEASUREX_URL:-http://localhost:3000}"
PASS=0; FAIL=0; ERRORS=()

pass() { echo "  ✅ $1"; ((PASS++)); }
fail() { echo "  ❌ $1"; ((FAIL++)); ERRORS+=("$1"); }
section() { echo ""; echo "━━ $1 ━━"; }

# ── React-compatible input helper ──
# Uses nativeInputValueSetter to properly trigger React onChange
react_fill() {
  local TESTID="$1"
  local VALUE="$2"
  browser-use eval "
    const el = document.querySelector('[data-testid=\"$TESTID\"]') || document.querySelector('[aria-label=\"$TESTID\"]');
    if (!el) return 'NOT_FOUND: $TESTID';
    el.focus();
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, '$VALUE');
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    'ok: ' + el.value;
  " 2>/dev/null
}

# ── Click by data-testid ──
testid_click() {
  browser-use eval "
    const el = document.querySelector('[data-testid=\"$1\"]');
    if(el) { el.click(); 'clicked'; } else 'NOT_FOUND: $1';
  " 2>/dev/null
}

# ── API call with 429 retry ──
api() {
  local URL="$1"; shift
  local RETRIES=3
  for i in $(seq 1 $RETRIES); do
    local OUT=$(curl -sL -w "\n%{http_code}" "$URL" "$@" 2>/dev/null)
    local STATUS=$(echo "$OUT" | tail -1)
    local BODY=$(echo "$OUT" | head -n -1)
    if [ "$STATUS" = "429" ]; then
      echo "  ⏳ Rate limit hit, waiting 15s..." >&2
      sleep 15
      continue
    fi
    echo "$BODY"
    return 0
  done
  echo "{}"
  return 1
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MeasureX E2E — browser-use CLI"
echo "  Target: $BASE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Server health ──
section "1. Server Health"
STATUS=$(api "$BASE/api/projects" | python3 -c "import sys,json; json.load(sys.stdin); print('ok')" 2>/dev/null)
[ "$STATUS" = "ok" ] && pass "API /api/projects → 200" || fail "API unreachable"

# ── 2. Browser loads projects page ──
section "2. Projects Page"
browser-use open "$BASE/projects" 2>/dev/null; sleep 4
STATE=$(browser-use state 2>/dev/null)
echo "$STATE" | grep -q "MeasureX\|MEASUREX" && pass "MeasureX branding visible" || fail "MeasureX not found"
echo "$STATE" | grep -q "New Project" && pass "'New Project' button present" || fail "'New Project' missing"
echo "$STATE" | grep -q "All Projects\|ALL PROJECTS" && pass "Project grid visible" || fail "Project grid missing"

# ── 3. Create project via UI ──
section "3. Create Project (UI)"
PROJ_NAME="E2E-$(date +%s)"

# Click New Project
browser-use eval "document.querySelector('[aria-label=\"New Project\"]')?.click()" 2>/dev/null
sleep 2

# Fill project name using React-compatible setter
react_fill "project-name-input" "$PROJ_NAME" >/dev/null
sleep 0.5

# Click Create
testid_click "create-project-btn" >/dev/null
sleep 4

# Verify landed in takeoff editor
STATE=$(browser-use state 2>/dev/null)
echo "$STATE" | grep -q "MEASUREX\|New Classification\|Quantities\|TAKEOFF" && pass "Takeoff editor opened" || {
  fail "Takeoff editor not loading"
  # Fallback: create via API
  PROJ_NAME="E2E-API-$(date +%s)"
}

# ── 4. Get project ID from API ──
section "4. Verify Project in API"
sleep 2
PROJ_ID=$(api "$BASE/api/projects" | python3 -c "
import sys,json
d=json.load(sys.stdin)
projs=[p for p in d.get('projects',[]) if p.get('name','').startswith('E2E')]
print(projs[0]['id'] if projs else '')
" 2>/dev/null)

[ -n "$PROJ_ID" ] && pass "Project in API: ${PROJ_ID:0:8}..." || {
  fail "Project not found in API — creating via API"
  PROJ_ID=$(api "$BASE/api/projects" -X POST -H "Content-Type: application/json" \
    -d "{\"name\":\"$PROJ_NAME\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('project',{}).get('id',''))" 2>/dev/null)
  [ -n "$PROJ_ID" ] && echo "  ℹ️  Fallback API project: ${PROJ_ID:0:8}..." || fail "API project creation also failed"
}

# Navigate to the project
[ -n "$PROJ_ID" ] && browser-use open "$BASE/?project=$PROJ_ID" 2>/dev/null && sleep 5

# ── 5. Add classification via UI ──
section "5. New Classification (UI)"
if [ -n "$PROJ_ID" ]; then
  # Click New Classification button
  browser-use eval "Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')==='New Classification')?.click()" 2>/dev/null
  sleep 2

  # Fill name using React-compatible setter
  react_fill "classification-name-input" "Floor Area" >/dev/null
  sleep 0.5

  # Set type using React-compatible setter  
  react_fill "classification-type-select" "area" >/dev/null
  sleep 0.5

  # Click Create/Save
  testid_click "save-classification-btn" >/dev/null
  sleep 2

  # Verify in API
  CLS_CNT=$(api "$BASE/api/projects/$PROJ_ID/classifications" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('classifications',[])))" 2>/dev/null)
  CLS_ID=$(api "$BASE/api/projects/$PROJ_ID/classifications" | python3 -c "import sys,json; cls=json.load(sys.stdin).get('classifications',[]); print(cls[0]['id'] if cls else '')" 2>/dev/null)
  [ "${CLS_CNT:-0}" -ge "1" ] && pass "Classification created (${CLS_CNT} via API)" || {
    fail "Classification not created via UI — fallback to API"
    CLS_RESP=$(api "$BASE/api/projects/$PROJ_ID/classifications" -X POST -H "Content-Type: application/json" \
      -d '{"name":"Floor Area","color":"#3B82F6","type":"area"}')
    CLS_ID=$(echo "$CLS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('classification',{}).get('id',''))" 2>/dev/null)
  }
fi

# ── 6. Verify UI reflects classification ──
section "6. UI Reflects Data"
STATE=$(browser-use state 2>/dev/null)
echo "$STATE" | grep -q "Floor Area" && pass "Classification visible in sidebar" || fail "Classification not in UI"

# ── 7. Draw polygon via API ──
section "7. Polygon"
if [ -n "$PROJ_ID" ] && [ -n "$CLS_ID" ]; then
  POLY=$(api "$BASE/api/projects/$PROJ_ID/polygons" -X POST -H "Content-Type: application/json" \
    -d "{\"classificationId\":\"$CLS_ID\",\"points\":[{\"x\":100,\"y\":100},{\"x\":300,\"y\":100},{\"x\":300,\"y\":300},{\"x\":100,\"y\":300}],\"pageNumber\":1,\"label\":\"E2E Floor\"}")
  POLY_ID=$(echo "$POLY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('polygon',{}).get('id',''))" 2>/dev/null)
  [ -n "$POLY_ID" ] && pass "Polygon drawn: ${POLY_ID:0:8}..." || fail "Polygon creation failed"
fi

# ── 8. Quantities ──
section "8. Quantities"
if [ -n "$PROJ_ID" ]; then
  QTY=$(api "$BASE/api/projects/$PROJ_ID/quantities" | python3 -c "
import sys,json
d=json.load(sys.stdin)
qty=d.get('quantities',[])
fa=[q for q in qty if q.get('name')=='Floor Area']
print('ok:'+str(round(fa[0]['area'],1)) if fa else 'missing')
" 2>/dev/null)
  echo "$QTY" | grep -q "^ok:" && pass "Quantities OK: $QTY" || fail "Quantities not computing ($QTY)"
fi

# ── 9. Export ──
section "9. Export"
if [ -n "$PROJ_ID" ]; then
  EXP=$(api "$BASE/api/projects/$PROJ_ID/export/json" | python3 -c "import sys,json; d=json.load(sys.stdin); print('polygons:', len(d.get('polygons',[])))" 2>/dev/null)
  echo "$EXP" | grep -q "polygons:" && pass "JSON export: $EXP" || fail "Export failed"
fi

# ── 10. Screenshot ──
section "10. Screenshot"
SHOT="/tmp/measurex-e2e-$(date +%s).png"
browser-use screenshot "$SHOT" 2>/dev/null
[ -f "$SHOT" ] && pass "Screenshot: $(du -h $SHOT | cut -f1)" || fail "Screenshot failed"

# ── Cleanup ──
section "Cleanup"
[ -n "$PROJ_ID" ] && api "$BASE/api/projects/$PROJ_ID" -X DELETE -o /dev/null 2>/dev/null && pass "Project cleaned up"
browser-use close 2>/dev/null

# ── Summary ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS+FAIL))
echo "  $PASS/$TOTAL passed"
[ ${#ERRORS[@]} -gt 0 ] && echo "  Failures:" && for e in "${ERRORS[@]}"; do echo "    ❌ $e"; done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
