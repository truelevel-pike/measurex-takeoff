#!/usr/bin/env bash
# MeasureX Smoke Test — curl-based end-to-end API verification
# Usage: BASE_URL=http://localhost:3000 bash scripts/smoke-test.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASSED=0
FAILED=0
PROJECT_ID=""
CLASSIFICATION_ID=""

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

run_test() {
  local name="$1"
  shift
  local output
  local http_code

  # Run the test function, capture output
  if output=$("$@" 2>&1); then
    green "  PASS  $name"
    PASSED=$((PASSED + 1))
    echo "$output"
  else
    red "  FAIL  $name"
    echo "        $output" >&2
    FAILED=$((FAILED + 1))
  fi
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local label="${3:-}"
  if [ "$actual" != "$expected" ]; then
    echo "Expected HTTP $expected, got $actual $label"
    return 1
  fi
}

# ─── Test 1: Create project ──────────────────────────────────────
test_create_project() {
  local resp
  resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/projects" \
    -H "Content-Type: application/json" \
    -d '{"name":"Smoke Test Project"}')

  local body http_code
  http_code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')

  assert_status "200" "$http_code" "(create project)"

  PROJECT_ID=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project',d).get('id',''))" 2>/dev/null)
  if [ -z "$PROJECT_ID" ]; then
    echo "No project ID in response"
    return 1
  fi
  echo "$PROJECT_ID"
}

# ─── Test 2: Upload PDF ──────────────────────────────────────────
test_upload_pdf() {
  local pdf_path="test-plans/kirkland-sample-plans.pdf"
  if [ ! -f "$pdf_path" ]; then
    echo "Test PDF not found at $pdf_path — skipping upload"
    return 1
  fi

  local resp
  resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/projects/$PROJECT_ID/upload" \
    -F "file=@$pdf_path")

  local body http_code
  http_code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')

  assert_status "200" "$http_code" "(upload PDF)"

  local pages
  pages=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pages',0))" 2>/dev/null)
  if [ "$pages" -lt 1 ] 2>/dev/null; then
    echo "Expected at least 1 page, got $pages"
    return 1
  fi
  echo "Uploaded $pages pages"
}

# ─── Test 3: Create classification ───────────────────────────────
test_create_classification() {
  local cls_id
  cls_id=$(python3 -c "import uuid; print(uuid.uuid4())")

  local resp
  resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/projects/$PROJECT_ID/classifications" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$cls_id\",\"name\":\"Concrete Slab\",\"type\":\"area\",\"color\":\"#3b82f6\",\"visible\":true}")

  local body http_code
  http_code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')

  assert_status "200" "$http_code" "(create classification)"

  CLASSIFICATION_ID=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('classification',d).get('id',''))" 2>/dev/null)
  if [ -z "$CLASSIFICATION_ID" ]; then
    CLASSIFICATION_ID="$cls_id"
  fi
  echo "$CLASSIFICATION_ID"
}

# ─── Test 4: Create polygon ──────────────────────────────────────
test_create_polygon() {
  local poly_id
  poly_id=$(python3 -c "import uuid; print(uuid.uuid4())")

  local resp
  resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/projects/$PROJECT_ID/polygons" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$poly_id\",\"classificationId\":\"$CLASSIFICATION_ID\",\"points\":[{\"x\":100,\"y\":100},{\"x\":300,\"y\":100},{\"x\":300,\"y\":300},{\"x\":100,\"y\":300}],\"pageNumber\":1}")

  local body http_code
  http_code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')

  assert_status "200" "$http_code" "(create polygon)"
  echo "Polygon created"
}

# ─── Test 5: Get quantities ──────────────────────────────────────
test_get_quantities() {
  local resp
  resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/projects/$PROJECT_ID/quantities")

  local body http_code
  http_code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')

  assert_status "200" "$http_code" "(get quantities)"

  local has_quantities
  has_quantities=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'quantities' in d or 'classifications' in d else 'no')" 2>/dev/null)
  if [ "$has_quantities" != "yes" ]; then
    echo "Response missing quantities data"
    return 1
  fi
  echo "Quantities retrieved"
}

# ─── Test 6: Export Excel ─────────────────────────────────────────
test_export_excel() {
  local resp
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/projects/$PROJECT_ID/export/excel")

  assert_status "200" "$http_code" "(export excel)"
  echo "Excel export OK"
}

# ─── Run all tests ────────────────────────────────────────────────
echo ""
echo "MeasureX Smoke Test"
echo "  $BASE_URL"
echo ""

run_test "1. Create project"        test_create_project
run_test "2. Upload PDF"            test_upload_pdf
run_test "3. Create classification" test_create_classification
run_test "4. Create polygon"        test_create_polygon
run_test "5. Get quantities"        test_get_quantities
run_test "6. Export Excel"          test_export_excel

echo ""
echo "Results: $PASSED passed, $FAILED failed"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
