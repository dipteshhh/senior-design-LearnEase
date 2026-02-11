#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# LearnEase Backend — End-to-End Lifecycle Test
# ─────────────────────────────────────────────────────────────
# Prerequisites:
#   1. backend/.env must have:
#        OPENAI_API_KEY=<real key>
#        ALLOW_LEGACY_AUTH_COOKIES=true
#        FILE_ENCRYPTION_KEY=<64-char hex>
#   2. No other process on PORT (default 3001)
#
# Usage:
#   cd backend && bash scripts/e2e-test.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

BASE="http://localhost:3001"
COOKIE="learnease_user_id=e2e-test-user; learnease_user_email=e2e@test.edu"
PASS=0
FAIL=0
TOTAL=0
SERVER_PID=""
TMPDIR_E2E=""

# ── Helpers ──────────────────────────────────────────────────

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$TMPDIR_E2E" && -d "$TMPDIR_E2E" ]]; then
    rm -rf "$TMPDIR_E2E"
  fi
}
trap cleanup EXIT

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
bold()   { printf "\033[1m%s\033[0m\n" "$1"; }

assert() {
  local label="$1" actual="$2" expected="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$actual" == "$expected" ]]; then
    green "  ✅ $label"
    PASS=$((PASS + 1))
  else
    red "  ❌ $label  (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$haystack" | grep -q "$needle"; then
    green "  ✅ $label"
    PASS=$((PASS + 1))
  else
    red "  ❌ $label  (expected to contain: $needle)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_empty() {
  local label="$1" value="$2"
  TOTAL=$((TOTAL + 1))
  if [[ -n "$value" && "$value" != "null" ]]; then
    green "  ✅ $label"
    PASS=$((PASS + 1))
  else
    red "  ❌ $label  (was empty or null)"
    FAIL=$((FAIL + 1))
  fi
}

http_status() {
  local method="$1" url="$2"
  shift 2
  curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" -H "Cookie: $COOKIE" "$@"
}

http_body() {
  local method="$1" url="$2"
  shift 2
  curl -s -X "$method" "$url" -H "Cookie: $COOKIE" "$@"
}

wait_for_server() {
  local retries=30
  while ! curl -s -o /dev/null "$BASE/api/documents" -H "Cookie: $COOKIE" 2>/dev/null; do
    retries=$((retries - 1))
    if [[ $retries -le 0 ]]; then
      red "Server failed to start within 30 seconds."
      exit 1
    fi
    sleep 1
  done
}

# ── Create test DOCX fixtures ────────────────────────────────

TMPDIR_E2E=$(mktemp -d)

yellow "Generating test DOCX files..."
node scripts/generate-test-docx.mjs "$TMPDIR_E2E"
echo ""

# ── Start server with high rate limit for testing ────────────

bold "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bold "  LearnEase Backend — E2E Lifecycle Test"
bold "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

yellow "Starting backend server..."
RATE_LIMIT_MAX=200 npx tsx src/index.ts &
SERVER_PID=$!
wait_for_server
green "Server is up (PID $SERVER_PID)"
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 1: Auth — reject unauthenticated request
# ══════════════════════════════════════════════════════════════
bold "1) Auth — reject unauthenticated request"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/documents")
assert "GET /api/documents without cookie → 401" "$STATUS" "401"
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 2: Upload homework PDF → extraction + classification
# ══════════════════════════════════════════════════════════════
bold "2) Upload homework DOCX → extraction + classification"
UPLOAD_HW=$(http_body POST "$BASE/api/upload" -F "file=@$TMPDIR_E2E/homework-test.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document")
HW_STATUS=$(echo "$UPLOAD_HW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
HW_DOCTYPE=$(echo "$UPLOAD_HW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('document_type',''))" 2>/dev/null || echo "")
HW_ID=$(echo "$UPLOAD_HW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('document_id',''))" 2>/dev/null || echo "")

assert "Upload returns status=uploaded" "$HW_STATUS" "uploaded"
assert "Homework classified as HOMEWORK" "$HW_DOCTYPE" "HOMEWORK"
assert_not_empty "document_id is present" "$HW_ID"
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 3: Upload lecture PDF → extraction + classification
# ══════════════════════════════════════════════════════════════
bold "3) Upload lecture DOCX → extraction + classification"
UPLOAD_LEC=$(http_body POST "$BASE/api/upload" -F "file=@$TMPDIR_E2E/lecture-test.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document")
LEC_STATUS=$(echo "$UPLOAD_LEC" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
LEC_DOCTYPE=$(echo "$UPLOAD_LEC" | python3 -c "import sys,json; print(json.load(sys.stdin).get('document_type',''))" 2>/dev/null || echo "")
LEC_ID=$(echo "$UPLOAD_LEC" | python3 -c "import sys,json; print(json.load(sys.stdin).get('document_id',''))" 2>/dev/null || echo "")

assert "Upload returns status=uploaded" "$LEC_STATUS" "uploaded"
assert "Lecture classified as LECTURE" "$LEC_DOCTYPE" "LECTURE"
assert_not_empty "document_id is present" "$LEC_ID"
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 4: List documents
# ══════════════════════════════════════════════════════════════
bold "4) List documents"
DOC_LIST=$(http_body GET "$BASE/api/documents")
DOC_COUNT=$(echo "$DOC_LIST" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

TOTAL=$((TOTAL + 1))
if [[ "$DOC_COUNT" -ge 2 ]]; then
  green "  ✅ GET /api/documents returns >= 2 documents ($DOC_COUNT)"
  PASS=$((PASS + 1))
else
  red "  ❌ GET /api/documents expected >= 2, got $DOC_COUNT"
  FAIL=$((FAIL + 1))
fi
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 5: Reject file type (text file)
# ══════════════════════════════════════════════════════════════
bold "5) Reject unsupported file type"
echo "plain text" > "$TMPDIR_E2E/bad.txt"
BAD_STATUS=$(http_status POST "$BASE/api/upload" -F "file=@$TMPDIR_E2E/bad.txt;type=text/plain")
assert "Upload .txt → 415" "$BAD_STATUS" "415"
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 6: Quiz blocked for non-lecture document
# ══════════════════════════════════════════════════════════════
bold "6) Quiz blocked for homework (non-lecture)"
QUIZ_BLOCK_STATUS=$(http_status POST "$BASE/api/quiz/create" \
  -H "Content-Type: application/json" \
  -d "{\"document_id\": \"$HW_ID\"}")
assert "POST /api/quiz/create on homework → 422" "$QUIZ_BLOCK_STATUS" "422"
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 7: Create study guide (OpenAI call)
# ══════════════════════════════════════════════════════════════
bold "7) Create study guide for homework doc (OpenAI)"
SG_CREATE_STATUS=$(http_status POST "$BASE/api/study-guide/create" \
  -H "Content-Type: application/json" \
  -d "{\"document_id\": \"$HW_ID\"}")
assert "POST /api/study-guide/create → 202" "$SG_CREATE_STATUS" "202"

yellow "  ⏳ Waiting for study guide generation (up to 90s)..."
SG_READY=false
SG_FAILED=false
for i in $(seq 1 90); do
  SG_GET_STATUS=$(http_status GET "$BASE/api/study-guide/$HW_ID")
  if [[ "$SG_GET_STATUS" == "200" ]]; then
    SG_READY=true
    break
  fi
  # Check if document status went to failed
  DOC_STATUS_NOW=$(http_body GET "$BASE/api/documents" | python3 -c "
import sys,json
docs=json.load(sys.stdin)
for d in docs:
  if d['id']=='$HW_ID': print(d.get('status',''))
" 2>/dev/null || echo "")
  if [[ "$DOC_STATUS_NOW" == "failed" ]]; then
    SG_FAILED=true
    break
  fi
  sleep 1
done

TOTAL=$((TOTAL + 1))
if $SG_READY; then
  green "  ✅ Study guide ready after ${i}s"
  PASS=$((PASS + 1))
elif $SG_FAILED; then
  red "  ❌ Study guide generation FAILED (document status=failed)"
  # Print the document details for debugging
  yellow "  Debug: document list entry:"
  http_body GET "$BASE/api/documents" | python3 -c "
import sys,json
docs=json.load(sys.stdin)
for d in docs:
  if d['id']=='$HW_ID': print(json.dumps(d,indent=2))
" 2>/dev/null || true
  FAIL=$((FAIL + 1))
else
  red "  ❌ Study guide not ready after 90s (last HTTP status: $SG_GET_STATUS)"
  FAIL=$((FAIL + 1))
fi
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 8: Validate study guide structure
# ══════════════════════════════════════════════════════════════
bold "8) Validate study guide JSON structure"
if $SG_READY; then
  SG_BODY=$(http_body GET "$BASE/api/study-guide/$HW_ID")

  SG_TITLE=$(echo "$SG_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('overview',{}).get('title',''))" 2>/dev/null || echo "")
  SG_SUMMARY=$(echo "$SG_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('overview',{}).get('summary',''))" 2>/dev/null || echo "")
  SG_KA_COUNT=$(echo "$SG_BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('key_actions',[])))" 2>/dev/null || echo "0")
  SG_CL_COUNT=$(echo "$SG_BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('checklist',[])))" 2>/dev/null || echo "0")
  SG_SEC_COUNT=$(echo "$SG_BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('sections',[])))" 2>/dev/null || echo "0")
  SG_HAS_DETAILS=$(echo "$SG_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('important_details',{}); print('yes' if 'dates' in d and 'policies' in d and 'contacts' in d and 'logistics' in d else 'no')" 2>/dev/null || echo "no")

  # Check first key_action has supporting_quote + citations
  SG_KA_QUOTE=$(echo "$SG_BODY" | python3 -c "import sys,json; ka=json.load(sys.stdin).get('key_actions',[]); print(ka[0].get('supporting_quote','') if ka else '')" 2>/dev/null || echo "")
  SG_KA_CITES=$(echo "$SG_BODY" | python3 -c "import sys,json; ka=json.load(sys.stdin).get('key_actions',[]); print(len(ka[0].get('citations',[])) if ka else 0)" 2>/dev/null || echo "0")

  assert_not_empty "overview.title present" "$SG_TITLE"
  assert_not_empty "overview.summary present" "$SG_SUMMARY"
  assert "important_details has all 4 keys" "$SG_HAS_DETAILS" "yes"

  TOTAL=$((TOTAL + 1))
  if [[ "$SG_KA_COUNT" -gt 0 ]]; then
    green "  ✅ key_actions has $SG_KA_COUNT items"
    PASS=$((PASS + 1))
  else
    red "  ❌ key_actions is empty"
    FAIL=$((FAIL + 1))
  fi

  TOTAL=$((TOTAL + 1))
  if [[ "$SG_SEC_COUNT" -gt 0 ]]; then
    green "  ✅ sections has $SG_SEC_COUNT items"
    PASS=$((PASS + 1))
  else
    red "  ❌ sections is empty"
    FAIL=$((FAIL + 1))
  fi

  assert_not_empty "key_action[0].supporting_quote present" "$SG_KA_QUOTE"

  TOTAL=$((TOTAL + 1))
  if [[ "$SG_KA_CITES" -gt 0 ]]; then
    green "  ✅ key_action[0] has $SG_KA_CITES citation(s)"
    PASS=$((PASS + 1))
  else
    red "  ❌ key_action[0] has no citations"
    FAIL=$((FAIL + 1))
  fi
else
  yellow "  ⚠️  Skipping structure checks (study guide not ready)"
fi
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 9: Idempotency — second create returns cached
# ══════════════════════════════════════════════════════════════
bold "9) Idempotency — second create returns cached"
if $SG_READY; then
  SG_CACHED=$(http_body POST "$BASE/api/study-guide/create" \
    -H "Content-Type: application/json" \
    -d "{\"document_id\": \"$HW_ID\"}")
  SG_CACHED_VAL=$(echo "$SG_CACHED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cached',''))" 2>/dev/null || echo "")
  assert "Second create returns cached=true" "$SG_CACHED_VAL" "True"
else
  yellow "  ⚠️  Skipping (study guide not ready)"
fi
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 10: Checklist update
# ══════════════════════════════════════════════════════════════
bold "10) Checklist update"
if $SG_READY; then
  CL_ITEM_ID=$(echo "$SG_BODY" | python3 -c "import sys,json; cl=json.load(sys.stdin).get('checklist',[]); print(cl[0]['id'] if cl else '')" 2>/dev/null || echo "")
  if [[ -n "$CL_ITEM_ID" ]]; then
    CL_STATUS=$(http_status PATCH "$BASE/api/checklist/$HW_ID" \
      -H "Content-Type: application/json" \
      -d "{\"item_id\": \"$CL_ITEM_ID\", \"completed\": true}")
    assert "PATCH checklist item → 200" "$CL_STATUS" "200"
  else
    yellow "  ⚠️  No checklist items to test"
  fi
else
  yellow "  ⚠️  Skipping (study guide not ready)"
fi
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 11: Create quiz for lecture doc (OpenAI)
# ══════════════════════════════════════════════════════════════
bold "11) Create quiz for lecture doc (OpenAI)"
QUIZ_CREATE_STATUS=$(http_status POST "$BASE/api/quiz/create" \
  -H "Content-Type: application/json" \
  -d "{\"document_id\": \"$LEC_ID\"}")
assert "POST /api/quiz/create → 202" "$QUIZ_CREATE_STATUS" "202"

yellow "  ⏳ Waiting for quiz generation (up to 90s)..."
QUIZ_READY=false
QUIZ_FAILED=false
for i in $(seq 1 90); do
  QUIZ_GET_STATUS=$(http_status GET "$BASE/api/quiz/$LEC_ID")
  if [[ "$QUIZ_GET_STATUS" == "200" ]]; then
    QUIZ_READY=true
    break
  fi
  # Check if document status went to failed
  DOC_STATUS_NOW=$(http_body GET "$BASE/api/documents" | python3 -c "
import sys,json
docs=json.load(sys.stdin)
for d in docs:
  if d['id']=='$LEC_ID': print(d.get('status',''))
" 2>/dev/null || echo "")
  if [[ "$DOC_STATUS_NOW" == "failed" ]]; then
    QUIZ_FAILED=true
    break
  fi
  sleep 1
done

TOTAL=$((TOTAL + 1))
if $QUIZ_READY; then
  green "  ✅ Quiz ready after ${i}s"
  PASS=$((PASS + 1))
elif $QUIZ_FAILED; then
  red "  ❌ Quiz generation FAILED (document status=failed)"
  yellow "  Debug: document list entry:"
  http_body GET "$BASE/api/documents" | python3 -c "
import sys,json
docs=json.load(sys.stdin)
for d in docs:
  if d['id']=='$LEC_ID': print(json.dumps(d,indent=2))
" 2>/dev/null || true
  FAIL=$((FAIL + 1))
else
  red "  ❌ Quiz not ready after 90s (last HTTP status: $QUIZ_GET_STATUS)"
  FAIL=$((FAIL + 1))
fi
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 12: Validate quiz structure
# ══════════════════════════════════════════════════════════════
bold "12) Validate quiz JSON structure"
if $QUIZ_READY; then
  QUIZ_BODY=$(http_body GET "$BASE/api/quiz/$LEC_ID")

  QUIZ_DOC_ID=$(echo "$QUIZ_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('document_id',''))" 2>/dev/null || echo "")
  QUIZ_Q_COUNT=$(echo "$QUIZ_BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('questions',[])))" 2>/dev/null || echo "0")
  QUIZ_Q_QUOTE=$(echo "$QUIZ_BODY" | python3 -c "import sys,json; qs=json.load(sys.stdin).get('questions',[]); print(qs[0].get('supporting_quote','') if qs else '')" 2>/dev/null || echo "")
  QUIZ_Q_OPTS=$(echo "$QUIZ_BODY" | python3 -c "import sys,json; qs=json.load(sys.stdin).get('questions',[]); print(len(qs[0].get('options',[])) if qs else 0)" 2>/dev/null || echo "0")
  QUIZ_Q_CITES=$(echo "$QUIZ_BODY" | python3 -c "import sys,json; qs=json.load(sys.stdin).get('questions',[]); print(len(qs[0].get('citations',[])) if qs else 0)" 2>/dev/null || echo "0")

  assert "quiz.document_id matches" "$QUIZ_DOC_ID" "$LEC_ID"

  TOTAL=$((TOTAL + 1))
  if [[ "$QUIZ_Q_COUNT" -gt 0 ]]; then
    green "  ✅ questions has $QUIZ_Q_COUNT items"
    PASS=$((PASS + 1))
  else
    red "  ❌ questions is empty"
    FAIL=$((FAIL + 1))
  fi

  assert_not_empty "question[0].supporting_quote present" "$QUIZ_Q_QUOTE"

  TOTAL=$((TOTAL + 1))
  if [[ "$QUIZ_Q_OPTS" -ge 4 ]]; then
    green "  ✅ question[0] has $QUIZ_Q_OPTS options"
    PASS=$((PASS + 1))
  else
    red "  ❌ question[0] has $QUIZ_Q_OPTS options (expected >= 4)"
    FAIL=$((FAIL + 1))
  fi

  TOTAL=$((TOTAL + 1))
  if [[ "$QUIZ_Q_CITES" -gt 0 ]]; then
    green "  ✅ question[0] has $QUIZ_Q_CITES citation(s)"
    PASS=$((PASS + 1))
  else
    red "  ❌ question[0] has no citations"
    FAIL=$((FAIL + 1))
  fi
else
  yellow "  ⚠️  Skipping structure checks (quiz not ready)"
fi
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 13: Ownership — different user can't access
# ══════════════════════════════════════════════════════════════
bold "13) Ownership — different user blocked"
OTHER_COOKIE="learnease_user_id=other-user; learnease_user_email=other@test.edu"
OWN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/study-guide/$HW_ID" -H "Cookie: $OTHER_COOKIE")
assert "Other user GET study guide → 403" "$OWN_STATUS" "403"
echo ""

# ══════════════════════════════════════════════════════════════
# TEST 14: Delete user data
# ══════════════════════════════════════════════════════════════
bold "14) Delete user data"
DEL_STATUS=$(http_status DELETE "$BASE/api/user/data")
assert "DELETE /api/user/data → 200" "$DEL_STATUS" "200"

# Verify documents are gone
DOC_AFTER=$(http_body GET "$BASE/api/documents")
DOC_AFTER_COUNT=$(echo "$DOC_AFTER" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
assert "Documents list empty after delete" "$DOC_AFTER_COUNT" "0"
echo ""

# ══════════════════════════════════════════════════════════════
# RESULTS
# ══════════════════════════════════════════════════════════════
bold "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bold "  RESULTS"
bold "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Total:  $TOTAL"
green "  Passed: $PASS"
if [[ $FAIL -gt 0 ]]; then
  red "  Failed: $FAIL"
else
  green "  Failed: $FAIL"
fi
echo ""

if [[ $FAIL -eq 0 ]]; then
  green "  🎉 ALL TESTS PASSED"
else
  red "  ⚠️  SOME TESTS FAILED"
fi
echo ""

exit $FAIL
