#!/usr/bin/env bash
# MeasureX E2E Test Suite — browser-use CLI (coordinate-based)
# Run: bash scripts/e2e-browser-use.sh
# Prerequisites: npm run dev running on localhost:3000

export PATH="$HOME/.browser-use-env/bin:$HOME/.local/bin:$PATH"
BASE="http://localhost:3000"
PASS=0; FAIL=0; ERRORS=()

pass() { echo "  ✅ $1"; ((PASS++)); }
fail() { echo "  ❌ $1"; ((FAIL++)); ERRORS+=("$1"); }
section() { echo ""; echo "━━ $1 ━━"; }

# Helper: get element center coordinates by aria-label
get_xy() {
  browser-use eval "
    const el = document.querySelector('[aria-label=\"$1\"]') || Array.from(document.querySelectorAll('button,input,select')).find(e=>e.textContent?.trim()==='$1');
    if(el){ const r=el.getBoundingClientRect(); [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)].join(' '); } else 'NOT_FOUND'
  " 2>/dev/null | grep -oE '[0-9]+ [0-9]+' | head -1
}

# Helper: click element by aria-label
click_label() {
  local XY=$(get_xy "$1")
  if [ -z "$XY" ]; then
    echo "  ⚠️  Could not find: $1" >&2
    return 1
  fi
  browser-use click $XY 2>/dev/null
}

# Helper: type into element by aria-label (React-compatible)
type_into() {
  browser-use eval "
    const el = document.querySelector('[aria-label=\"$1\"]') || document.querySelector('[placeholder*=\"$1\"]');
    if(el){
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, '$2');
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      'ok'
    } else 'not found'
  " 2>/dev/null
  local XY=$(get_xy "$1")
  [ -n "$XY" ] && browser-use click $XY 2>/dev/null
  # Type via real keystrokes as fallback
  sleep 0.3
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MeasureX E2E — browser-use CLI"
echo "  Using: coordinate-based interaction"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Server health ──
section "1. Server Health"
STATUS=$(curl -sL "$BASE/api/projects" -o /dev/null -w "%{http_code}")
[ "$STATUS" = "200" ] && pass "API /api/projects → 200" || { fail "API unreachable ($STATUS)"; }

# ── 2. Projects page loads ──
section "2. Projects Page"
browser-use open "$BASE/projects" 2>/dev/null; sleep 4
STATE=$(browser-use state 2>/dev/null)
echo "$STATE" | grep -q "MeasureX" && pass "MeasureX branding visible" || fail "MeasureX not found"
echo "$STATE" | grep -q "New Project" && pass "'New Project' present" || fail "'New Project' missing"
echo "$STATE" | grep -q "All Projects" && pass "Project grid visible" || fail "Project grid missing"

# ── 3. Create project ──
section "3. Create Project (via API — reliable)"
PROJ_NAME="E2E-$(date +%s)"
PROJ_RESP=$(curl -sL -X POST "$BASE/api/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PROJ_NAME\"}" 2>/dev/null)
PROJ_ID=$(echo "$PROJ_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('project',{}).get('id',''))" 2>/dev/null)

[ -n "$PROJ_ID" ] && pass "Project created: ${PROJ_ID:0:8}..." || fail "Project creation failed"

# ── 4. Navigate to project, verify UI loads ──
section "4. Takeoff Editor"
if [ -n "$PROJ_ID" ]; then
  browser-use open "$BASE/?project=$PROJ_ID" 2>/dev/null; sleep 5
  STATE=$(browser-use state 2>/dev/null)
  echo "$STATE" | grep -q "MEASUREX\|New Classification\|Quantities" && pass "Takeoff editor loaded" || fail "Takeoff editor not loading"
  echo "$STATE" | grep -q "Draw Area\|Select" && pass "Drawing tools visible" || fail "Drawing tools missing"
  echo "$STATE" | grep -q "Quantities\|Assemblies\|Estimate" && pass "Side panel tabs visible" || fail "Side panel missing"
fi

# ── 5. Add classification via API ──
section "5. Classification (via API)"
if [ -n "$PROJ_ID" ]; then
  CLS_RESP=$(curl -sL -X POST "$BASE/api/projects/$PROJ_ID/classifications" \
    -H "Content-Type: application/json" \
    -d '{"name":"Floor Area","color":"#3B82F6","type":"area"}' 2>/dev/null)
  CLS_ID=$(echo "$CLS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('classification',{}).get('id',''))" 2>/dev/null)
  [ -n "$CLS_ID" ] && pass "Classification created: Floor Area" || fail "Classification creation failed"
fi

# ── 6. Verify classification appears in UI ──
section "6. UI Reflects Data"
if [ -n "$PROJ_ID" ]; then
  browser-use open "$BASE/?project=$PROJ_ID" 2>/dev/null; sleep 5
  STATE=$(browser-use state 2>/dev/null)
  echo "$STATE" | grep -q "Floor Area" && pass "Classification visible in sidebar" || fail "Classification not showing in UI"
fi

# ── 7. Draw polygon via API ──
section "7. Polygon (via API)"
if [ -n "$PROJ_ID" ] && [ -n "$CLS_ID" ]; then
  POLY_RESP=$(curl -sL -X POST "$BASE/api/projects/$PROJ_ID/polygons" \
    -H "Content-Type: application/json" \
    -d "{\"classificationId\":\"$CLS_ID\",\"points\":[{\"x\":100,\"y\":100},{\"x\":300,\"y\":100},{\"x\":300,\"y\":300},{\"x\":100,\"y\":300}],\"pageNumber\":1,\"label\":\"E2E Slab\"}" 2>/dev/null)
  POLY_ID=$(echo "$POLY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('polygon',{}).get('id',''))" 2>/dev/null)
  [ -n "$POLY_ID" ] && pass "Polygon drawn: ${POLY_ID:0:8}..." || fail "Polygon creation failed"
fi

# ── 8. Verify quantities ──
section "8. Quantities Calculation"
if [ -n "$PROJ_ID" ]; then
  QTY=$(curl -sL "$BASE/api/projects/$PROJ_ID/quantities" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
qty=d.get('quantities',[])
area=[q for q in qty if q.get('name')=='Floor Area']
print('ok:'+str(round(area[0]['area'],1)) if area else 'no floor area')
")
  echo "$QTY" | grep -q "^ok:" && pass "Quantities calculated: $QTY" || fail "Quantities not computing ($QTY)"
fi

# ── 9. Screenshot final state ──
section "9. Screenshot"
SHOT="/tmp/measurex-e2e-$(date +%s).png"
browser-use screenshot "$SHOT" 2>/dev/null
[ -f "$SHOT" ] && pass "Screenshot: $SHOT ($(du -h "$SHOT" | cut -f1))" || fail "Screenshot failed"

# ── 10. Export ──
section "10. Export"
if [ -n "$PROJ_ID" ]; then
  EXP=$(curl -sL "$BASE/api/projects/$PROJ_ID/export/json" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('polygons:', len(d.get('polygons',[])))" 2>/dev/null)
  echo "$EXP" | grep -q "polygons: [1-9]" && pass "JSON export: $EXP" || fail "Export failed ($EXP)"
fi

# ── Cleanup ──
section "Cleanup"
if [ -n "$PROJ_ID" ]; then
  curl -sL -X DELETE "$BASE/api/projects/$PROJ_ID" -o /dev/null && pass "Project deleted" || fail "Cleanup failed"
fi
browser-use close 2>/dev/null

# ── Summary ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS+FAIL))
echo "  $PASS/$TOTAL passed"
[ ${#ERRORS[@]} -gt 0 ] && echo "  Failures:" && for e in "${ERRORS[@]}"; do echo "    ❌ $e"; done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
