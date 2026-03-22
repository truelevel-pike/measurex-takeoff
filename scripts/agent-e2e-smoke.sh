#!/usr/bin/env bash
# MeasureX Agent E2E smoke test — Wave 6D
# Tests all key API endpoints with timing + summary table
set -uo pipefail

BASE_URL="${1:-http://localhost:3000}"

# ---------- helpers ----------
_ms() { python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || date +%s%3N; }
_json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null; }
_assert_nonempty() { [ -n "$1" ]; }

PASS=0; FAIL=0
declare -a ROWS

step() {
  local name="$1"; shift
  local t0; t0=$(_ms)
  local result; result=$(eval "$@" 2>/dev/null) && local ok=1 || local ok=0
  local t1; t1=$(_ms)
  local ms=$(( t1 - t0 ))
  if [ "$ok" -eq 1 ]; then
    PASS=$(( PASS + 1 ))
    ROWS+=("$(printf '%-28s | ✅ PASS | %sms' "$name" "$ms")")
    echo "  ✅ $name (${ms}ms)"
    STEP_OUT="$result"
  else
    FAIL=$(( FAIL + 1 ))
    ROWS+=("$(printf '%-28s | ❌ FAIL | %sms' "$name" "$ms")")
    echo "  ❌ $name (${ms}ms)"
    STEP_OUT=""
  fi
}

http_ok() {
  local url="$1"; local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url")
  [ "$code" = "200" ] && echo "$code"
}

json_post() {
  curl -s -X POST "$1" -H 'Content-Type: application/json' -d "$2" --max-time 15
}

json_get() {
  curl -s --max-time 15 "$1"
}

# ---------- main ----------
echo "=== MeasureX Agent E2E Smoke Test ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Health check
step "Health" 'code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL"); [ "$code" = "200" ] && echo "$code"'

# 2. API health endpoint
step "API Health" 'r=$(json_get "$BASE_URL/api/health"); echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get(\"status\")==\"ok\", \"status not ok\"; print(d[\"status\"])"'

# 3. Create project
T0=$(_ms)
PROJECT=$(json_post "$BASE_URL/api/projects" "{\"name\":\"Agent E2E Test $(date +%s)\"}")
PROJECT_ID=$(echo "$PROJECT" | _json id)
T1=$(_ms)
MS=$(( T1 - T0 ))
if [ -n "$PROJECT_ID" ]; then
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-28s | ✅ PASS | %sms' "Create Project" "$MS")")
  echo "  ✅ Create Project (${MS}ms) → $PROJECT_ID"
else
  FAIL=$(( FAIL + 1 ))
  ROWS+=("$(printf '%-28s | ❌ FAIL | %sms' "Create Project" "$MS")")
  echo "  ❌ Create Project (${MS}ms) — response: $PROJECT"
  echo ""; echo "FATAL: cannot continue without project ID"; exit 1
fi

# 4. Create classification
T0=$(_ms)
CLASS=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/classifications" \
  '{"name":"Living Room","type":"area","color":"#3b82f6"}')
CLASS_ID=$(echo "$CLASS" | _json id)
T1=$(_ms); MS=$(( T1 - T0 ))
if [ -n "$CLASS_ID" ]; then
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-28s | ✅ PASS | %sms' "Create Classification" "$MS")")
  echo "  ✅ Create Classification (${MS}ms) → $CLASS_ID"
else
  FAIL=$(( FAIL + 1 ))
  ROWS+=("$(printf '%-28s | ❌ FAIL | %sms' "Create Classification" "$MS")")
  echo "  ❌ Create Classification (${MS}ms)"
fi

# 5. Create polygon
T0=$(_ms)
POLY=$(json_post "$BASE_URL/api/projects/$PROJECT_ID/polygons" \
  "{\"classificationId\":\"$CLASS_ID\",\"points\":[{\"x\":100,\"y\":100},{\"x\":300,\"y\":100},{\"x\":300,\"y\":300},{\"x\":100,\"y\":300}],\"area\":40000,\"linearFeet\":0,\"pageNumber\":1,\"isComplete\":true,\"label\":\"Living Room\"}")
POLY_ID=$(echo "$POLY" | _json id)
T1=$(_ms); MS=$(( T1 - T0 ))
if [ -n "$POLY_ID" ]; then
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-28s | ✅ PASS | %sms' "Create Polygon" "$MS")")
  echo "  ✅ Create Polygon (${MS}ms) → $POLY_ID"
else
  FAIL=$(( FAIL + 1 ))
  ROWS+=("$(printf '%-28s | ❌ FAIL | %sms' "Create Polygon" "$MS")")
  echo "  ❌ Create Polygon (${MS}ms)"
fi

# 6. GET pages endpoint
T0=$(_ms)
PAGES_RESP=$(json_get "$BASE_URL/api/projects/$PROJECT_ID/pages")
T1=$(_ms); MS=$(( T1 - T0 ))
PAGES_OK=$(echo "$PAGES_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'pages' in d; print(len(d['pages']))" 2>/dev/null)
if [ -n "$PAGES_OK" ]; then
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-28s | ✅ PASS | %sms' "GET Pages" "$MS")")
  echo "  ✅ GET Pages (${MS}ms) → ${PAGES_OK} page(s)"
else
  FAIL=$(( FAIL + 1 ))
  ROWS+=("$(printf '%-28s | ❌ FAIL | %sms' "GET Pages" "$MS")")
  echo "  ❌ GET Pages (${MS}ms) — response: $PAGES_RESP"
fi

# 7. GET quantities + validate area > 0
T0=$(_ms)
QTY_RESP=$(json_get "$BASE_URL/api/projects/$PROJECT_ID/quantities")
T1=$(_ms); MS=$(( T1 - T0 ))
QTY_AREA=$(echo "$QTY_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
qty=d.get('quantities',d) if isinstance(d,dict) else d
items=qty if isinstance(qty,list) else []
total=sum(float(q.get('area',0)) for q in items)
assert total>0, f'total area={total}'
print(total)
" 2>/dev/null)
if [ -n "$QTY_AREA" ]; then
  PASS=$(( PASS + 1 ))
  ROWS+=("$(printf '%-28s | ✅ PASS | %sms' "Quantities (area>0)" "$MS")")
  echo "  ✅ Quantities (${MS}ms) → total area=${QTY_AREA}"
else
  FAIL=$(( FAIL + 1 ))
  ROWS+=("$(printf '%-28s | ❌ FAIL | %sms' "Quantities (area>0)" "$MS")")
  echo "  ❌ Quantities area>0 (${MS}ms) — response: $QTY_RESP"
fi

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
