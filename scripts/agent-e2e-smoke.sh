#!/usr/bin/env bash
# MeasureX Agent E2E smoke test — Wave 6D
# Tests all key API endpoints with timing + summary table
# Usage: ./agent-e2e-smoke.sh [BASE_URL]
set -uo pipefail

BASE_URL="${1:-http://localhost:3000}"

# ---------- helpers ----------
_ms() { python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || date +%s%3N; }

# Extract id from { "id": "..." } OR { "project": { "id": "..." } } etc.
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

PASS=0; FAIL=0
declare -a ROWS

pass_step() {
  local name="$1" ms="$2" detail="${3:-}"
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-28s | ✅ PASS | %sms' "$name" "$ms")")
  echo "  ✅ $name (${ms}ms)${detail:+ — $detail}"
}

fail_step() {
  local name="$1" ms="$2" detail="${3:-}"
  FAIL=$(( FAIL + 1 ))
  ROWS+=("$(printf '%-28s | ❌ FAIL | %sms' "$name" "$ms")")
  echo "  ❌ $name (${ms}ms)${detail:+ — $detail}"
}

json_post() {
  curl -s -X POST "$1" -H 'Content-Type: application/json' -d "$2" --max-time 15
}

json_get() {
  curl -s --max-time 15 "$1"
}

# ============================================================
echo "=== MeasureX Agent E2E Smoke Test ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Health check
T0=$(_ms)
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL" 2>/dev/null)
T1=$(_ms); MS=$(( T1 - T0 ))
[ "$STATUS" = "200" ] && pass_step "Health" "$MS" "HTTP $STATUS" || fail_step "Health" "$MS" "HTTP $STATUS"

# 2. API health endpoint
T0=$(_ms)
HEALTH=$(json_get "$BASE_URL/api/health")
T1=$(_ms); MS=$(( T1 - T0 ))
HEALTH_STATUS=$(echo "$HEALTH" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
[ "$HEALTH_STATUS" = "ok" ] && pass_step "API Health" "$MS" "$HEALTH_STATUS" || fail_step "API Health" "$MS" "$HEALTH"

# 3. Create project
T0=$(_ms)
PROJECT=$(json_post "$BASE_URL/api/projects" "{\"name\":\"Agent E2E Test $(date +%s)\"}")
PROJECT_ID=$(echo "$PROJECT" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
if [ -n "$PROJECT_ID" ]; then
  pass_step "Create Project" "$MS" "$PROJECT_ID"
else
  fail_step "Create Project" "$MS" "$(echo "$PROJECT" | head -c 120)"
  echo ""; echo "FATAL: cannot continue without project ID"; exit 1
fi

# 4. Create classification
T0=$(_ms)
CLASS=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/classifications" \
  '{"name":"Living Room","type":"area","color":"#3b82f6"}')
CLASS_ID=$(echo "$CLASS" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$CLASS_ID" ] \
  && pass_step "Create Classification" "$MS" "$CLASS_ID" \
  || fail_step "Create Classification" "$MS" "$(echo "$CLASS" | head -c 120)"

# 5. Set scale (required for area > 0 in quantities)
T0=$(_ms)
SCALE_RESP=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/scale" \
  '{"pixelsPerUnit":18,"unit":"ft","label":"Custom","source":"manual","pageNumber":1}')
T1=$(_ms); MS=$(( T1 - T0 ))
SCALE_PPU=$(echo "$SCALE_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if isinstance(d,dict):
    if 'pixelsPerUnit' in d: print(d['pixelsPerUnit'])
    elif 'scale' in d: print(d['scale'].get('pixelsPerUnit',''))
    else: print('')
" 2>/dev/null)
[ -n "$SCALE_PPU" ] && pass_step "Set Scale" "$MS" "${SCALE_PPU} px/ft" || fail_step "Set Scale" "$MS" "$(echo "$SCALE_RESP" | head -c 80)"

# 6. Create polygon
T0=$(_ms)
POLY=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/polygons" \
  "{\"classificationId\":\"$CLASS_ID\",\
\"points\":[{\"x\":100,\"y\":100},{\"x\":400,\"y\":100},{\"x\":400,\"y\":400},{\"x\":100,\"y\":400}],\
\"area\":277.78,\"linearFeet\":0,\"pageNumber\":1,\"isComplete\":true,\"label\":\"Living Room\"}")
POLY_ID=$(echo "$POLY" | _extract_id)
T1=$(_ms); MS=$(( T1 - T0 ))
[ -n "$POLY_ID" ] \
  && pass_step "Create Polygon" "$MS" "$POLY_ID" \
  || fail_step "Create Polygon" "$MS" "$(echo "$POLY" | head -c 120)"

# 6. GET pages endpoint
T0=$(_ms)
PAGES_RESP=$(json_get "$BASE_URL/api/projects/$PROJECT_ID/pages")
T1=$(_ms); MS=$(( T1 - T0 ))
PAGES_OK=$(echo "$PAGES_RESP" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); assert 'pages' in d; print(len(d['pages']))" 2>/dev/null)
[ -n "$PAGES_OK" ] \
  && pass_step "GET Pages" "$MS" "${PAGES_OK} page(s)" \
  || fail_step "GET Pages" "$MS" "$(echo "$PAGES_RESP" | head -c 120)"

# 7. GET quantities + validate area > 0
T0=$(_ms)
QTY_RESP=$(json_get "$BASE_URL/api/projects/$PROJECT_ID/quantities")
T1=$(_ms); MS=$(( T1 - T0 ))
QTY_AREA=$(echo "$QTY_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('quantities', d if isinstance(d,list) else [])
if isinstance(items, dict): items=list(items.values())
total=sum(float(q.get('area',0)) for q in items if isinstance(q,dict))
assert total>0, f'total area={total}'
print(total)
" 2>/dev/null)
[ -n "$QTY_AREA" ] \
  && pass_step "Quantities (area>0)" "$MS" "total area=${QTY_AREA}" \
  || fail_step "Quantities (area>0)" "$MS" "$(echo "$QTY_RESP" | head -c 120)"

# ---------- summary ----------
echo ""
echo "================================================================"
echo " Step                         | Result  | Time"
echo "------------------------------+---------+------"
for row in "${ROWS[@]}"; do echo " $row"; done
echo "================================================================"
TOTAL=$(( PASS + FAIL ))
echo " Total: $TOTAL  ✅ $PASS passed  ❌ $FAIL failed"
echo "================================================================"
echo ""
echo "Agent URL: $BASE_URL/?project=$PROJECT_ID&agent=1"
echo ""

[ "$FAIL" -eq 0 ] && echo "ALL SMOKE TESTS PASSED ✅" && exit 0
echo "SMOKE TEST FAILED ❌ ($FAIL/$TOTAL steps failed)"
exit 1
