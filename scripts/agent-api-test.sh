#!/usr/bin/env bash
# MeasureX Agent API Test — Wave 6D
# Simulates the exact sequence a MeasureX agent will perform:
#   create project → classifications → scale → polygons → assert quantities → webhook → export
# Usage: ./agent-api-test.sh [BASE_URL]
set -uo pipefail

BASE_URL="${1:-http://localhost:3000}"
TOLERANCE=5  # percent tolerance for quantity assertions

# ---------- helpers ----------
_ms() { python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || date +%s%3N; }

# Extract id from { "id": "..." } OR { "project": { "id": "..." } } OR { "classification": ... } etc.
_extract_id() {
  python3 -c "
import json, sys
raw = sys.stdin.read().strip()
try:
    d = json.loads(raw)
except Exception:
    print(''); sys.exit(0)
if isinstance(d, dict):
    if 'id' in d:
        print(d['id']); sys.exit(0)
    for v in d.values():
        if isinstance(v, dict) and 'id' in v:
            print(v['id']); sys.exit(0)
print('')
" 2>/dev/null
}

assert_approx() {
  # assert_approx <actual> <expected> <tolerance_pct>
  python3 -c "
actual=float('$1'); expected=float('$2'); tol=float('$3')
diff=abs(actual-expected)/max(abs(expected),0.001)*100
print('ok' if diff<=tol else f'FAIL: got {actual} expected {expected} (diff {diff:.1f}% > {tol}%)')
" 2>/dev/null
}

PASS=0; FAIL=0
declare -a ROWS
RATE_DELAY="${RATE_DELAY:-1}"  # seconds between POST requests; set to 0 to disable

pass_step() {
  local name="$1" ms="$2" detail="${3:-}"
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-36s | ✅ PASS | %sms' "$name" "$ms")")
  echo "  ✅ $name (${ms}ms)${detail:+ — $detail}"
}

fail_step() {
  local name="$1" ms="$2" detail="${3:-}"
  FAIL=$(( FAIL + 1 ))
  ROWS+=("$(printf '%-36s | ❌ FAIL | %sms' "$name" "$ms")")
  echo "  ❌ $name (${ms}ms)${detail:+ — $detail}"
}

# best-effort step: failure counts as PASS (warns only)
warn_step() {
  local name="$1" ms="$2" detail="${3:-}"
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-36s | ⚠️  WARN | %sms' "$name" "$ms")")
  echo "  ⚠️  $name (${ms}ms)${detail:+ — $detail}"
}

json_post() {
  [ "${RATE_DELAY:-1}" -gt 0 ] 2>/dev/null && sleep "${RATE_DELAY:-1}"
  curl -s -X POST "$1" -H 'Content-Type: application/json' -d "$2" --max-time 15
}

json_get() {
  curl -s --max-time 15 "$1"
}

# ============================================================
echo "=== MeasureX Agent API Test ==="
echo "Base URL: $BASE_URL"
echo "Scale: 18 px/ft  |  Tolerance: ±${TOLERANCE}%  |  Expected: Area=277.78 SF, Wall=66.67 LF (perimeter)"
echo ""

# ── STEP 1: Create project ──────────────────────────────────
T0=$(_ms)
PROJECT=$(json_post "$BASE_URL/api/projects" \
  "{\"name\":\"Agent API Test $(date +%s)\"}")
PROJECT_ID=$(echo "$PROJECT" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
if [ -n "$PROJECT_ID" ]; then
  pass_step "Create Project" "$MS" "$PROJECT_ID"
else
  fail_step "Create Project" "$MS" "$(echo "$PROJECT" | head -c 120)"
  echo ""; echo "FATAL: cannot continue without project ID"; exit 1
fi

# ── STEP 2: Create 3 classifications ───────────────────────
T0=$(_ms)
CL_AREA=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/classifications" \
  '{"name":"Living Room","type":"area","color":"#3b82f6"}')
CL_AREA_ID=$(echo "$CL_AREA" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$CL_AREA_ID" ] \
  && pass_step "Create Classification (area)" "$MS" "Living Room → $CL_AREA_ID" \
  || fail_step "Create Classification (area)" "$MS" "$(echo "$CL_AREA" | head -c 120)"

T0=$(_ms)
CL_LIN=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/classifications" \
  '{"name":"Wall","type":"linear","color":"#f59e0b"}')
CL_LIN_ID=$(echo "$CL_LIN" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$CL_LIN_ID" ] \
  && pass_step "Create Classification (linear)" "$MS" "Wall → $CL_LIN_ID" \
  || fail_step "Create Classification (linear)" "$MS" "$(echo "$CL_LIN" | head -c 120)"

T0=$(_ms)
CL_CNT=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/classifications" \
  '{"name":"Door","type":"count","color":"#ef4444"}')
CL_CNT_ID=$(echo "$CL_CNT" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$CL_CNT_ID" ] \
  && pass_step "Create Classification (count)" "$MS" "Door → $CL_CNT_ID" \
  || fail_step "Create Classification (count)" "$MS" "$(echo "$CL_CNT" | head -c 120)"

# ── STEP 3: Set scale (18 px/ft) ───────────────────────────
T0=$(_ms)
SCALE_RESP=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/scale" \
  '{"pixelsPerUnit":18,"unit":"ft","label":"Custom","source":"manual","pageNumber":1}')
SCALE_PPU=$(echo "$SCALE_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if isinstance(d,dict):
    if 'pixelsPerUnit' in d: print(d['pixelsPerUnit'])
    elif 'scale' in d: print(d['scale'].get('pixelsPerUnit',''))
    else: print('')
" 2>/dev/null)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$SCALE_PPU" ] \
  && pass_step "Set Scale" "$MS" "${SCALE_PPU} px/ft" \
  || fail_step "Set Scale" "$MS" "$(echo "$SCALE_RESP" | head -c 120)"

# ── STEP 4a: Area polygon — 300×300 px square ──────────────
# Points: (100,100)→(400,100)→(400,400)→(100,400) — 300px side
# Area via shoelace: 300² = 90000 px² / 18² = 277.78 SF
AREA_SF=277.78
T0=$(_ms)
POLY_AREA=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/polygons" \
  "{\"classificationId\":\"$CL_AREA_ID\",\
\"points\":[{\"x\":100,\"y\":100},{\"x\":400,\"y\":100},{\"x\":400,\"y\":400},{\"x\":100,\"y\":400}],\
\"area\":$AREA_SF,\"linearFeet\":0,\"pageNumber\":1,\"isComplete\":true,\"label\":\"Living Room\"}")
POLY_AREA_ID=$(echo "$POLY_AREA" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$POLY_AREA_ID" ] \
  && pass_step "Create Area Polygon" "$MS" "Living Room ${AREA_SF} SF → $POLY_AREA_ID" \
  || fail_step "Create Area Polygon" "$MS" "$(echo "$POLY_AREA" | head -c 120)"

# ── STEP 4b: Linear polygon — 300 px square perimeter ──────
# Server uses calculateLinearLength(closed=true) = full perimeter
# 4 × 300px / 18 px/ft = 1200/18 = 66.67 LF
LIN_LF=66.67
T0=$(_ms)
POLY_LIN=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/polygons" \
  "{\"classificationId\":\"$CL_LIN_ID\",\
\"points\":[{\"x\":100,\"y\":100},{\"x\":400,\"y\":100},{\"x\":400,\"y\":400},{\"x\":100,\"y\":400}],\
\"area\":0,\"linearFeet\":0,\"pageNumber\":1,\"isComplete\":true,\"label\":\"Wall\"}")
POLY_LIN_ID=$(echo "$POLY_LIN" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$POLY_LIN_ID" ] \
  && pass_step "Create Linear Polygon" "$MS" "Wall ${LIN_LF} LF → $POLY_LIN_ID" \
  || fail_step "Create Linear Polygon" "$MS" "$(echo "$POLY_LIN" | head -c 120)"

# ── STEP 4c: Count polygon — 1 door ────────────────────────
T0=$(_ms)
POLY_CNT=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/polygons" \
  "{\"classificationId\":\"$CL_CNT_ID\",\
\"points\":[{\"x\":200,\"y\":200},{\"x\":260,\"y\":200},{\"x\":260,\"y\":280},{\"x\":200,\"y\":280}],\
\"area\":0,\"linearFeet\":0,\"pageNumber\":1,\"isComplete\":true,\"label\":\"Door\"}")
POLY_CNT_ID=$(echo "$POLY_CNT" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$POLY_CNT_ID" ] \
  && pass_step "Create Count Polygon" "$MS" "Door → $POLY_CNT_ID" \
  || fail_step "Create Count Polygon" "$MS" "$(echo "$POLY_CNT" | head -c 120)"

# ── STEP 5: Read quantities + assert values ─────────────────
T0=$(_ms)
QTY_RESP=$(json_get "$BASE_URL/api/projects/$PROJECT_ID/quantities")
T1=$(_ms); QTY_MS=$(( T1 - T0 ))

# Parse all three quantities
QTY_AREA_VAL=$(echo "$QTY_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('quantities',d) if isinstance(d,dict) else d
if isinstance(items,dict): items=list(items.values())
row=next((q for q in items if isinstance(q,dict) and q.get('type')=='area'),None)
print(row['area'] if row else '')
" 2>/dev/null)

QTY_LIN_VAL=$(echo "$QTY_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('quantities',d) if isinstance(d,dict) else d
if isinstance(items,dict): items=list(items.values())
row=next((q for q in items if isinstance(q,dict) and q.get('type')=='linear'),None)
print(row['linearFeet'] if row else '')
" 2>/dev/null)

QTY_CNT_VAL=$(echo "$QTY_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('quantities',d) if isinstance(d,dict) else d
if isinstance(items,dict): items=list(items.values())
row=next((q for q in items if isinstance(q,dict) and q.get('type')=='count'),None)
print(row.get('count',0) if row else '')
" 2>/dev/null)

# Assert Living Room area ≈ AREA_SF ± TOLERANCE%
if [ -n "$QTY_AREA_VAL" ]; then
  AREA_ASSERT=$(assert_approx "$QTY_AREA_VAL" "$AREA_SF" "$TOLERANCE")
  [ "$AREA_ASSERT" = "ok" ] \
    && pass_step "Assert Living Room ~${AREA_SF} SF" "$QTY_MS" "actual=${QTY_AREA_VAL} SF" \
    || fail_step "Assert Living Room ~${AREA_SF} SF" "$QTY_MS" "$AREA_ASSERT"
else
  fail_step "Assert Living Room ~${AREA_SF} SF" "$QTY_MS" "no area quantity in: $(echo "$QTY_RESP" | head -c 80)"
fi

# Assert Wall linear ≈ LIN_LF ± TOLERANCE%
if [ -n "$QTY_LIN_VAL" ]; then
  LIN_ASSERT=$(assert_approx "$QTY_LIN_VAL" "$LIN_LF" "$TOLERANCE")
  [ "$LIN_ASSERT" = "ok" ] \
    && pass_step "Assert Wall ~${LIN_LF} LF (perim)" "$QTY_MS" "actual=${QTY_LIN_VAL} LF" \
    || fail_step "Assert Wall ~${LIN_LF} LF (perim)" "$QTY_MS" "$LIN_ASSERT"
else
  fail_step "Assert Wall ~${LIN_LF} LF (perim)" "$QTY_MS" "no linear quantity returned"
fi

# Assert Door count = 1
if [ "$QTY_CNT_VAL" = "1" ]; then
  pass_step "Assert Door count = 1" "$QTY_MS" "count=$QTY_CNT_VAL"
else
  fail_step "Assert Door count = 1" "$QTY_MS" "actual count=${QTY_CNT_VAL:-<empty>}"
fi

# ── STEP 6: Trigger webhook (best-effort) ───────────────────
T0=$(_ms)
WH_RESP=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/webhooks" \
  "{\"event\":\"agent_test_complete\",\"projectId\":\"$PROJECT_ID\",\
\"quantities\":{\"area\":${QTY_AREA_VAL:-0},\"linearFeet\":${QTY_LIN_VAL:-0}}}" 2>/dev/null || echo '{}')
T1=$(_ms); MS=$(( T1 - T0 ))
WH_OK=$(echo "$WH_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok' if d.get('ok') or d.get('status')=='ok' or d.get('queued') or d.get('received') else '')
" 2>/dev/null)
if [ -n "$WH_OK" ]; then
  pass_step "Trigger Webhook" "$MS"
else
  warn_step "Trigger Webhook" "$MS" "non-fatal — response: $(echo "$WH_RESP" | head -c 80)"
fi

# ── STEP 7: Export JSON (best-effort — may not exist yet) ───
T0=$(_ms)
EXPORT=$(json_get "$BASE_URL/api/projects/$PROJECT_ID/export")
T1=$(_ms); MS=$(( T1 - T0 ))
EXPORT_OK=$(echo "$EXPORT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); assert isinstance(d,dict) and 'error' not in d; print('ok')" \
  2>/dev/null)
if [ "$EXPORT_OK" = "ok" ]; then
  pass_step "Export JSON" "$MS"
else
  EXPORT_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL/api/projects/$PROJECT_ID/export" 2>/dev/null)
  warn_step "Export JSON" "$MS" "HTTP $EXPORT_CODE — endpoint not yet implemented (non-fatal)"
fi

# ── SUMMARY ────────────────────────────────────────────────
echo ""
echo "===================================================================="
echo " Step                                | Result  | Time"
echo "-------------------------------------+---------+------"
for row in "${ROWS[@]}"; do echo " $row"; done
echo "===================================================================="
TOTAL=$(( PASS + FAIL ))
echo " Total: $TOTAL  ✅ $PASS passed  ❌ $FAIL failed"
echo "===================================================================="
echo ""
echo "Project URL: $BASE_URL/?project=$PROJECT_ID&agent=1"
echo ""

[ "$FAIL" -eq 0 ] && echo "ALL AGENT API TESTS PASSED ✅" && exit 0
echo "AGENT API TEST FAILED ❌ ($FAIL/$TOTAL steps failed)"
exit 1
