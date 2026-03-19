#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# MeasureX Takeoff — E2E Workflow Test (curl-based)
#
# Starts the dev server, runs the full takeoff workflow via curl,
# then tears down. Each step prints PASS or FAIL with HTTP status.
#
# Usage: ./scripts/e2e-test.sh
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
DEV_PID=""
PASSED=0
FAILED=0
PROJECT_ID=""
CLASSIFICATION_ID=""

# ── cleanup on exit ─────────────────────────────────────────────────
cleanup() {
  if [ -n "$DEV_PID" ]; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  echo ""
  echo "─────────────────────────────────────"
  echo "  Total: $((PASSED + FAILED))   Passed: ${PASSED}   Failed: ${FAILED}"
  echo "─────────────────────────────────────"
  if [ "$FAILED" -gt 0 ]; then
    exit 1
  fi
}
trap cleanup EXIT

# ── helper: run a test step ─────────────────────────────────────────
# Usage: run_test "Step name" <curl args...>
# Sets $RESPONSE (body) and $HTTP_STATUS after each call.
RESPONSE=""
HTTP_STATUS=""

do_curl() {
  local tmpfile
  tmpfile=$(mktemp)
  HTTP_STATUS=$(curl -s -o "$tmpfile" -w "%{http_code}" "$@")
  RESPONSE=$(cat "$tmpfile")
  rm -f "$tmpfile"
}

pass() {
  echo "  ✅ PASS  $1  (HTTP ${HTTP_STATUS})"
  PASSED=$((PASSED + 1))
}

fail() {
  echo "  ❌ FAIL  $1  (HTTP ${HTTP_STATUS})"
  echo "          ${2:-$RESPONSE}"
  FAILED=$((FAILED + 1))
}

# ── start dev server ────────────────────────────────────────────────
echo ""
echo "🔧 MeasureX Takeoff — E2E Curl Tests"
echo "   Starting dev server on port ${PORT}..."
echo ""

npm run dev -- --port "$PORT" &>/dev/null &
DEV_PID=$!

# Wait for server to be ready (up to 30s)
TRIES=0
until curl -s -o /dev/null -w "" "${BASE}" 2>/dev/null; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge 60 ]; then
    echo "  ❌ Dev server failed to start within 30s"
    FAILED=$((FAILED + 1))
    exit 1
  fi
  sleep 0.5
done
echo "   Dev server ready (PID ${DEV_PID})"
echo ""

# ── Step 1: Create project ──────────────────────────────────────────
do_curl -X POST "${BASE}/api/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"E2E Curl Test Project"}'

if [ "$HTTP_STATUS" = "200" ]; then
  PROJECT_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('project',{}).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$PROJECT_ID" ]; then
    pass "Create project (id=${PROJECT_ID})"
  else
    fail "Create project" "No project id in response"
  fi
else
  fail "Create project"
fi

# ── Step 2: Upload PDF ──────────────────────────────────────────────
# Create a minimal valid PDF for the upload
MINI_PDF=$(mktemp /tmp/e2e-test-XXXXXX.pdf)
printf '%%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%%%EOF' > "$MINI_PDF"

do_curl -X POST "${BASE}/api/projects/${PROJECT_ID}/upload" \
  -F "file=@${MINI_PDF};type=application/pdf"
rm -f "$MINI_PDF"

if [ "$HTTP_STATUS" = "200" ]; then
  PAGES=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pages',0))" 2>/dev/null || echo "0")
  if [ "$PAGES" -gt 0 ] 2>/dev/null; then
    pass "Upload PDF (${PAGES} pages)"
  else
    fail "Upload PDF" "Expected pages > 0, got ${PAGES}"
  fi
else
  fail "Upload PDF"
fi

# ── Step 3: Create classification ───────────────────────────────────
do_curl -X POST "${BASE}/api/projects/${PROJECT_ID}/classifications" \
  -H "Content-Type: application/json" \
  -d '{"name":"Living Room","color":"#3b82f6","type":"area"}'

if [ "$HTTP_STATUS" = "200" ]; then
  CLASSIFICATION_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('classification',{}).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$CLASSIFICATION_ID" ]; then
    pass "Create classification (id=${CLASSIFICATION_ID})"
  else
    fail "Create classification" "No classification id in response"
  fi
else
  fail "Create classification"
fi

# ── Step 4: Create polygon ──────────────────────────────────────────
do_curl -X POST "${BASE}/api/projects/${PROJECT_ID}/polygons" \
  -H "Content-Type: application/json" \
  -d "{\"classificationId\":\"${CLASSIFICATION_ID}\",\"points\":[{\"x\":10,\"y\":10},{\"x\":100,\"y\":10},{\"x\":100,\"y\":100},{\"x\":10,\"y\":100}],\"pageNumber\":1}"

if [ "$HTTP_STATUS" = "200" ]; then
  pass "Create polygon"
else
  fail "Create polygon"
fi

# ── Step 5: Get quantities ──────────────────────────────────────────
do_curl "${BASE}/api/projects/${PROJECT_ID}/quantities"

if [ "$HTTP_STATUS" = "200" ]; then
  HAS_QTY=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if isinstance(d.get('quantities'), list) else 'no')" 2>/dev/null || echo "no")
  if [ "$HAS_QTY" = "yes" ]; then
    pass "Get quantities"
  else
    fail "Get quantities" "quantities not an array"
  fi
else
  fail "Get quantities"
fi

# ── Step 6: Export Excel ────────────────────────────────────────────
do_curl "${BASE}/api/projects/${PROJECT_ID}/export/excel"

if [ "$HTTP_STATUS" = "200" ]; then
  pass "Export Excel"
else
  fail "Export Excel"
fi

# ── Step 7: Delete project ──────────────────────────────────────────
do_curl -X DELETE "${BASE}/api/projects/${PROJECT_ID}"

if [ "$HTTP_STATUS" = "200" ]; then
  pass "Delete project"
else
  fail "Delete project"
fi
