#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
COOKIE_HEADER="${COOKIE_HEADER:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-120}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-2}"

declare -a CASES=()

print_usage() {
  cat <<'EOF'
LearnEase backend smoke test

Usage:
  ./scripts/smoke-api.sh \
    --cookie 'learnease_session=<signed_session_cookie>' \
    --case '/absolute/path/lecture.pdf|LECTURE' \
    --case '/absolute/path/homework.pdf|HOMEWORK' \
    --case '/absolute/path/syllabus.docx|SYLLABUS'

Options:
  --base URL            API base URL (default: http://localhost:3001)
  --cookie VALUE        Cookie header value for auth (required)
  --case PATH|TYPE      Upload test case; TYPE in HOMEWORK|LECTURE|SYLLABUS|UNSUPPORTED
  --timeout SEC         Max seconds to wait for async generation (default: 120)
  --poll-interval SEC   Poll interval seconds (default: 2)
  --help                Show this help

Notes:
  - Backend must already be running.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_URL="$2"
      shift 2
      ;;
    --cookie)
      COOKIE_HEADER="$2"
      shift 2
      ;;
    --case)
      CASES+=("$2")
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --poll-interval)
      POLL_INTERVAL_SECONDS="$2"
      shift 2
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      print_usage
      exit 1
      ;;
  esac
done

if [[ -z "$COOKIE_HEADER" ]]; then
  echo "[FAIL] Missing --cookie"
  print_usage
  exit 1
fi

if [[ ${#CASES[@]} -eq 0 ]]; then
  echo "[FAIL] At least one --case is required"
  print_usage
  exit 1
fi

for cmd in curl node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[FAIL] Required command not found: $cmd"
    exit 1
  fi
done

split_response() {
  local raw="$1"
  HTTP_BODY="${raw%$'\n'*}"
  HTTP_STATUS="${raw##*$'\n'}"
}

mime_type_for_file() {
  local file_path="$1"
  local lower_file_path
  lower_file_path="$(printf '%s' "$file_path" | tr '[:upper:]' '[:lower:]')"
  case "$lower_file_path" in
    *.pdf) echo "application/pdf" ;;
    *.docx) echo "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
    *)
      echo ""
      ;;
  esac
}

json_get() {
  local json="$1"
  local expr="$2"
  printf '%s' "$json" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));const v=($expr);if(v===undefined||v===null){process.exit(2)}if(typeof v==='object'){process.stdout.write(JSON.stringify(v));}else{process.stdout.write(String(v));}"
}

json_has_study_guide_shape() {
  local json="$1"
  printf '%s' "$json" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));const ok=d&&d.overview&&Array.isArray(d.key_actions)&&Array.isArray(d.checklist)&&d.important_details&&Array.isArray(d.sections);process.exit(ok?0:1);"
}

json_has_quiz_shape() {
  local json="$1"
  printf '%s' "$json" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));const ok=d&&typeof d.document_id==='string'&&Array.isArray(d.questions);process.exit(ok?0:1);"
}

document_status_by_id() {
  local document_id="$1"
  local docs_json
  docs_json="$(curl -sS "$BASE_URL/api/documents" -H "Cookie: $COOKIE_HEADER")"
  printf '%s' "$docs_json" | node -e "const fs=require('fs');const id=process.argv[1];const items=JSON.parse(fs.readFileSync(0,'utf8'));const found=Array.isArray(items)?items.find((x)=>x && x.id===id):null;process.stdout.write(found && typeof found.status==='string' ? found.status : '');" "$document_id"
}

declare -a DOC_IDS=()
declare -a DOC_TYPES=()
declare -a DOC_FILES=()

echo "=== 1) Upload + classification checks ==="
for entry in "${CASES[@]}"; do
  file_path="${entry%%|*}"
  expected_type="${entry##*|}"

  if [[ "$file_path" == "$entry" || "$expected_type" == "$entry" ]]; then
    echo "[FAIL] Invalid --case format: $entry (expected PATH|TYPE)"
    exit 1
  fi

  if [[ ! -f "$file_path" ]]; then
    echo "[FAIL] File not found: $file_path"
    exit 1
  fi

  mime_type="$(mime_type_for_file "$file_path")"
  if [[ -z "$mime_type" ]]; then
    echo "[FAIL] Unsupported file extension for smoke upload: $file_path (expected .pdf or .docx)"
    exit 1
  fi

  raw="$(curl -sS -X POST "$BASE_URL/api/upload" \
    -H "Cookie: $COOKIE_HEADER" \
    -F "file=@$file_path;type=$mime_type" \
    -w $'\n%{http_code}')"
  split_response "$raw"

  if [[ "$HTTP_STATUS" != "201" ]]; then
    echo "[FAIL] upload $file_path -> HTTP $HTTP_STATUS"
    echo "$HTTP_BODY"
    exit 1
  fi

  doc_id="$(json_get "$HTTP_BODY" "d.document_id")"
  doc_type="$(json_get "$HTTP_BODY" "d.document_type")"
  status="$(json_get "$HTTP_BODY" "d.status")"

  if [[ "$status" != "uploaded" ]]; then
    echo "[FAIL] upload status expected 'uploaded', got '$status'"
    exit 1
  fi

  if [[ "$doc_type" != "$expected_type" ]]; then
    echo "[FAIL] classification mismatch for $file_path: expected $expected_type, got $doc_type"
    exit 1
  fi

  DOC_IDS+=("$doc_id")
  DOC_TYPES+=("$doc_type")
  DOC_FILES+=("$file_path")
  echo "[PASS] upload $file_path -> id=$doc_id type=$doc_type"
done

echo "=== 2) Study guide generation checks ==="
for i in "${!DOC_IDS[@]}"; do
  doc_id="${DOC_IDS[$i]}"
  doc_type="${DOC_TYPES[$i]}"

  if [[ "$doc_type" == "UNSUPPORTED" ]]; then
    raw="$(curl -sS -X POST "$BASE_URL/api/study-guide/create" \
      -H "Cookie: $COOKIE_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"document_id\":\"$doc_id\"}" \
      -w $'\n%{http_code}')"
    split_response "$raw"
    if [[ "$HTTP_STATUS" != "422" ]]; then
      echo "[FAIL] unsupported study-guide create expected 422, got $HTTP_STATUS for $doc_id"
      echo "$HTTP_BODY"
      exit 1
    fi
    echo "[PASS] unsupported document correctly rejected for study guide ($doc_id)"
    continue
  fi

  raw="$(curl -sS -X POST "$BASE_URL/api/study-guide/create" \
    -H "Cookie: $COOKIE_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"document_id\":\"$doc_id\"}" \
    -w $'\n%{http_code}')"
  split_response "$raw"
  if [[ "$HTTP_STATUS" != "202" && "$HTTP_STATUS" != "200" ]]; then
    echo "[FAIL] study-guide create expected 202/200, got $HTTP_STATUS for $doc_id"
    echo "$HTTP_BODY"
    exit 1
  fi

  start_epoch="$(date +%s)"
  while true; do
    raw="$(curl -sS "$BASE_URL/api/study-guide/$doc_id" \
      -H "Cookie: $COOKIE_HEADER" \
      -w $'\n%{http_code}')"
    split_response "$raw"

    if [[ "$HTTP_STATUS" == "200" ]]; then
      if ! json_has_study_guide_shape "$HTTP_BODY"; then
        echo "[FAIL] study-guide schema shape invalid for $doc_id"
        echo "$HTTP_BODY"
        exit 1
      fi
      echo "[PASS] study guide ready with expected top-level shape ($doc_id)"
      break
    fi

    status_now="$(document_status_by_id "$doc_id")"
    if [[ "$status_now" == "failed" ]]; then
      echo "[FAIL] study-guide generation failed for $doc_id (document status=failed)"
      exit 1
    fi

    now_epoch="$(date +%s)"
    elapsed="$((now_epoch - start_epoch))"
    if (( elapsed >= TIMEOUT_SECONDS )); then
      echo "[FAIL] timed out waiting for study guide ($doc_id)"
      curl -sS "$BASE_URL/api/documents" -H "Cookie: $COOKIE_HEADER" || true
      exit 1
    fi

    sleep "$POLL_INTERVAL_SECONDS"
  done
done

echo "=== 3) Lecture-only quiz checks ==="
lecture_doc_id=""
non_lecture_doc_id=""

for i in "${!DOC_IDS[@]}"; do
  if [[ "${DOC_TYPES[$i]}" == "LECTURE" && -z "$lecture_doc_id" ]]; then
    lecture_doc_id="${DOC_IDS[$i]}"
  fi
  if [[ "${DOC_TYPES[$i]}" != "LECTURE" && -z "$non_lecture_doc_id" ]]; then
    non_lecture_doc_id="${DOC_IDS[$i]}"
  fi
done

if [[ -n "$lecture_doc_id" ]]; then
  raw="$(curl -sS -X POST "$BASE_URL/api/quiz/create" \
    -H "Cookie: $COOKIE_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"document_id\":\"$lecture_doc_id\"}" \
    -w $'\n%{http_code}')"
  split_response "$raw"
  if [[ "$HTTP_STATUS" != "202" && "$HTTP_STATUS" != "200" ]]; then
    echo "[FAIL] quiz create expected 202/200 for lecture, got $HTTP_STATUS"
    echo "$HTTP_BODY"
    exit 1
  fi

  start_epoch="$(date +%s)"
  while true; do
    raw="$(curl -sS "$BASE_URL/api/quiz/$lecture_doc_id" \
      -H "Cookie: $COOKIE_HEADER" \
      -w $'\n%{http_code}')"
    split_response "$raw"
    if [[ "$HTTP_STATUS" == "200" ]]; then
      if ! json_has_quiz_shape "$HTTP_BODY"; then
        echo "[FAIL] quiz schema shape invalid for lecture doc $lecture_doc_id"
        echo "$HTTP_BODY"
        exit 1
      fi
      echo "[PASS] quiz ready with expected top-level shape ($lecture_doc_id)"
      break
    fi

    status_now="$(document_status_by_id "$lecture_doc_id")"
    if [[ "$status_now" == "failed" ]]; then
      echo "[FAIL] quiz generation failed for $lecture_doc_id (document status=failed)"
      exit 1
    fi

    now_epoch="$(date +%s)"
    elapsed="$((now_epoch - start_epoch))"
    if (( elapsed >= TIMEOUT_SECONDS )); then
      echo "[FAIL] timed out waiting for quiz ($lecture_doc_id)"
      curl -sS "$BASE_URL/api/documents" -H "Cookie: $COOKIE_HEADER" || true
      exit 1
    fi

    sleep "$POLL_INTERVAL_SECONDS"
  done
else
  echo "[SKIP] No lecture case provided; skipping quiz success path"
fi

if [[ -n "$non_lecture_doc_id" ]]; then
  raw="$(curl -sS -X POST "$BASE_URL/api/quiz/create" \
    -H "Cookie: $COOKIE_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"document_id\":\"$non_lecture_doc_id\"}" \
    -w $'\n%{http_code}')"
  split_response "$raw"
  if [[ "$HTTP_STATUS" != "422" ]]; then
    echo "[FAIL] non-lecture quiz should be rejected with 422, got $HTTP_STATUS"
    echo "$HTTP_BODY"
    exit 1
  fi
  echo "[PASS] non-lecture quiz correctly rejected ($non_lecture_doc_id)"
else
  echo "[SKIP] No non-lecture case provided; skipping lecture-only rejection check"
fi

echo "=== Smoke test complete: PASS ==="
echo "Focus Mode note: backend supports this via lecture study-guide sections; UI controls visibility."
