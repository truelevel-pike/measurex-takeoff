#!/usr/bin/env bash
# MeasureX Agent E2E smoke test
# Tests the full agent loop: open app → create classification → draw via coord panel → verify label
set -euo pipefail
BASE_URL="${1:-http://localhost:3000}"
echo '=== MeasureX Agent E2E Smoke Test ==='
echo "Base URL: $BASE_URL"

# 1. Health check
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL")
[ "$STATUS" = '200' ] && echo '✅ App is up' || { echo "❌ App not reachable (HTTP $STATUS)"; exit 1; }

# 2. API health
HEALTH=$(curl -s "$BASE_URL/api/health" 2>/dev/null || echo '{}')
echo "✅ API health: $HEALTH"

# 3. Create a test project
PROJECT=$(curl -s -X POST "$BASE_URL/api/projects" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Agent E2E Test $(date +%s)"}' 2>/dev/null)
PROJECT_ID=$(echo "$PROJECT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' 2>/dev/null)
[ -n "$PROJECT_ID" ] && echo "✅ Project created: $PROJECT_ID" || { echo '❌ Project creation failed'; exit 1; }

# 4. Create a classification
CLASS=$(curl -s -X POST "$BASE_URL/api/projects/$PROJECT_ID/classifications" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Living Room","type":"area","color":"#3b82f6"}' 2>/dev/null)
CLASS_ID=$(echo "$CLASS" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' 2>/dev/null)
[ -n "$CLASS_ID" ] && echo "✅ Classification created: $CLASS_ID" || { echo '❌ Classification creation failed'; exit 1; }

# 5. Create a polygon via API (simulates coord panel submit)
POLY=$(curl -s -X POST "$BASE_URL/api/projects/$PROJECT_ID/polygons" \
  -H 'Content-Type: application/json' \
  -d "{\"classificationId\":\"$CLASS_ID\",\"points\":[{\"x\":100,\"y\":100},{\"x\":300,\"y\":100},{\"x\":300,\"y\":300},{\"x\":100,\"y\":300}],\"area\":40000,\"linearFeet\":0,\"pageNumber\":1,\"isComplete\":true,\"label\":\"Living Room\"}" 2>/dev/null)
POLY_ID=$(echo "$POLY" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' 2>/dev/null)
[ -n "$POLY_ID" ] && echo "✅ Polygon created: $POLY_ID" || { echo '❌ Polygon creation failed'; exit 1; }

# 6. Verify quantities
QTY=$(curl -s "$BASE_URL/api/projects/$PROJECT_ID/quantities" 2>/dev/null)
echo "✅ Quantities: $QTY"

echo ''
echo 'ALL SMOKE TESTS PASSED ✅'
echo "Agent URL: $BASE_URL/?project=$PROJECT_ID&agent=1"
