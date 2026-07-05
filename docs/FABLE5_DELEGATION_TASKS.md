# Claude Fable 5 Delegation Pack: LearnEase Hardening and Rebuild Tasks

This packet is written for a top-tier coding model taking on hard engineering work in the LearnEase repo.

Repo: `/Users/diptesh/Projects/senior-design-LearnEase`
Branch: `main`
Owner: Diptesh, sole creator of LearnEase

## Before Touching Code

1. Run `git status --short --branch`.
2. Preserve any existing user or Codex changes. Do not overwrite uncommitted work unless explicitly asked.
3. Do not commit secrets or edit `backend/.env` / `frontend/.env.local` except to explain required local values.
4. Keep LearnEase's academic integrity boundary intact:
   - Never solve homework.
   - Never provide answers, hints, solution steps, essays, code, or computed results for graded work.
   - Preserve quote/citation validation and source grounding.
5. Prefer narrow, testable changes over broad rewrites.
6. Every task below must end with:
   - code changes, if needed
   - focused tests
   - local verification commands and results
   - a short risk note

Current expected commands:

```bash
cd backend && npm run lint && npm run build && npm test
cd frontend && npm run lint && npm run test && npm exec tsc --noEmit && npm run build
cd backend && bash scripts/e2e-test.sh
```

Run OpenAI-backed E2E only when the user approves cost/network usage or when the existing local setup already requires it.

## Current System Snapshot

LearnEase is a Google-authenticated academic document understanding app.

Core stack:
- Backend: Express, TypeScript, SQLite, encrypted artifacts, OpenAI
- Frontend: Next.js App Router, React, Tailwind
- Storage: SQLite metadata plus AES-256-GCM encrypted files under `ARTIFACTS_DIR`
- Hosting target: Railway

Recently verified:
- backend lint/build/unit tests pass
- frontend lint/test/type-check/build pass
- backend E2E passes with valid `backend/.env`
- GitHub frontend contract guard passes after the `NODE_ENV` type-check fix
- backend and frontend npm audits were clean in the last full audit

Important current area:
- Phase 3A Visual Notes Beta is partly/mostly implemented:
  - `VISUAL_INVENTORY`
  - `VISUAL_OBSERVATIONS`
  - backend visual observation generation
  - frontend Visual Notes Beta tab
  - tests around lecture-only generation and no raw image bytes

## Task 1: Phase 3A Visual Notes Beta Red-Team and Hardening

Goal: prove Visual Notes Beta is safe, lecture-only, text-only, failure-isolated, and production-ready.

Hard requirements:
- Homework and unsupported documents must never decrypt images for vision use and must never call OpenAI vision.
- Upload must not call any vision model.
- Visual observation failures must never fail normal Study Guide generation.
- API responses must never include image bytes, base64, data URIs, encrypted paths, temp paths, signed URLs, or thumbnails.
- Visual observations must never be treated as exact-text citations.
- Re-running generation must not duplicate `VISUAL_OBSERVATIONS`.
- Deleting one document or all user data must delete observations and visual artifacts.
- Retention cleanup must not leave orphaned observation artifacts.

What to inspect:
- `backend/src/services/visualObservationAnalyzer.ts`
- `backend/src/services/visualInventory.ts`
- `backend/src/store/memoryStore.ts`
- `backend/src/routes/contract.ts`
- `backend/src/db/sqlite.ts`
- `backend/src/tests/visualObservations.test.ts`
- `backend/src/tests/routeStateTransitions.test.ts`
- `frontend/src/app/(app)/documents/[id]/page.tsx`
- `frontend/src/lib/contracts.ts`
- `docs/PHASE3A_VISUAL_OBSERVATIONS_QA.md`

Expected deliverables:
- Add missing backend tests for:
  - idempotent `VISUAL_OBSERVATIONS` persistence
  - delete-one cleanup
  - delete-all cleanup
  - malformed/corrupt observations artifact read path
  - caps enforcement without leaking bytes
  - no image byte/base64/data URI in route response
  - best-effort failure isolation during Study Guide generation
- Add a pure frontend test, if practical, for Visual Notes tab visibility logic or formatting helpers.
- Add any missing runtime hardening found during the audit.
- Update docs only if the implementation contract changes.

Acceptance criteria:
- Full backend unit suite passes.
- Frontend lint/tests/type-check/build pass.
- A reviewer can grep the API response paths and see no raw image delivery path exists.

## Task 2: Auth, Session, CSRF, and Cookie Threat Model Hardening

Goal: make local and production auth robust against common web attacks without breaking Google sign-in.

Hard requirements:
- Preserve Google Sign-In flow.
- Preserve HttpOnly session cookie.
- Reject forged/tampered/expired cookies.
- Keep owner isolation: cross-user document, guide, quiz, checklist, visual observation, and delete access must fail.
- Production cookies must be secure behind Railway proxy.
- Add protection against cross-site state-changing requests.

What to inspect:
- `backend/src/routes/auth.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/index.ts`
- `backend/src/middleware/securityHeaders.ts`
- `backend/src/tests/auth*.test.ts`
- `backend/src/tests/googleAuth.test.ts`
- `frontend/src/app/signin/page.tsx`
- `frontend/src/middleware.ts` if present
- `docs/AUTH.md`

Expected deliverables:
- Threat model notes in a concise doc section or audit file.
- Tests for:
  - POST/DELETE/PATCH origin enforcement in production
  - allowed local dev behavior
  - session cookie flags in production vs development
  - logout clears cookie with matching attributes
  - forged session cookie rejection
  - cross-user access to every sensitive route, including visual observations
- If CSRF/origin checks are missing, implement them with an allowlist that works with Railway custom domains.

Acceptance criteria:
- No auth regression in E2E.
- Browser Google sign-in still works locally.
- Backend tests prove state-changing routes are origin-protected in production.

## Task 3: Production Readiness and Railway Deployment Drill

Goal: make deployment repeatable, diagnosable, and survivable.

Hard requirements:
- No production boot with missing critical secrets.
- Backend must expose a useful health/readiness story.
- SQLite path and artifact path must be explicit and persistent on Railway.
- Docs must be copy-paste accurate for Railway.
- A failed backend dependency should produce actionable logs, not silent frontend confusion.

What to inspect:
- `backend/railway.json`
- `frontend/railway.json`
- `docs/DEPLOY_CHECKLIST.md`
- `docs/DEPLOY_RAILWAY.md`
- `backend/src/index.ts`
- `frontend/src/app/api/backend-health` or related health routes
- `.github/workflows/*`

Expected deliverables:
- Add or improve a backend readiness endpoint if needed:
  - checks DB open/read/write basics safely
  - checks artifact directory exists and is writable
  - does not call OpenAI on readiness
- Add frontend backend-health diagnostics if missing:
  - distinguish frontend alive vs backend unreachable
  - expose safe status only
- Add deployment smoke script or docs that verify:
  - backend `/health`
  - frontend `/api/health`
  - frontend proxy to backend
  - auth failure behavior
  - upload size/type validation
- Update Railway docs with exact env names and no stale variables.

Acceptance criteria:
- Fresh developer can deploy from docs without guessing.
- Failed backend service produces a clear frontend health indicator.
- No secrets or sensitive config values appear in logs.

## Task 4: Data Lifecycle, Encryption, and Artifact Integrity Audit

Goal: make encrypted storage defensible and auditable.

Hard requirements:
- Uploaded files and derived artifacts stay encrypted on disk.
- SQLite stores metadata and encrypted paths only.
- Deletion removes registered artifact paths and document directories.
- Retention cleanup removes all document-related data.
- Corrupt or missing artifacts fail safely with sanitized errors.

What to inspect:
- `backend/src/lib/encryption.ts`
- `backend/src/store/memoryStore.ts`
- `backend/src/db/sqlite.ts`
- `backend/src/tests/encryption.test.ts`
- `backend/src/tests/storeCrud.test.ts`
- `backend/src/tests/visualInventory*.test.ts`
- `backend/src/tests/visualObservations.test.ts`

Expected deliverables:
- Add an internal dev/admin artifact integrity checker or extend existing CLI:
  - counts documents
  - checks registered artifact files exist
  - detects orphan artifact directories
  - validates decryptability without printing decrypted content
  - summarizes `VISUAL_INVENTORY` and `VISUAL_OBSERVATIONS` safely
- Add tests for missing/corrupt encrypted artifacts.
- Document how to run the checker.

Acceptance criteria:
- Integrity checker never prints decrypted document text, image bytes, base64, secrets, or raw keys.
- Tests cover missing, corrupt, and orphaned artifact scenarios.

## Task 5: Generation Reliability Rebuild

Goal: make Study Guide, Quiz, and Visual Observations generation robust under crashes, retries, rate limits, and duplicate clicks.

Hard requirements:
- Duplicate create/retry calls must be idempotent.
- A crashed server must recover interrupted processing states safely.
- Failed generation must give a user-safe retry path.
- OpenAI transient failures should not poison unrelated documents.
- Visual observations must remain a sidecar and never block Study Guide success.

What to inspect:
- `backend/src/routes/contract.ts`
- `backend/src/services/generationReliability.ts`
- `backend/src/services/contentAnalyzer.ts`
- `backend/src/services/quizGenerator.ts`
- `backend/src/services/visualObservationAnalyzer.ts`
- `backend/src/tests/routeStateTransitions.test.ts`
- `backend/scripts/e2e-test.sh`

Expected deliverables:
- State transition audit for every generation flow.
- Tests for:
  - double-click create
  - retry while processing
  - retry after failed
  - recovery from interrupted processing on startup
  - OpenAI timeout
  - malformed model output
  - circuit breaker behavior
  - visual sidecar failure isolation
- If code changes are needed, keep them small and strongly tested.

Acceptance criteria:
- Backend E2E still passes.
- Route state transition tests prove the lifecycle contract.
- No flow can get permanently stuck without a retry or recovery path.

## Task 6: Full Browser E2E and Accessibility Harness

Goal: add a real browser-level safety net for the flows that matter.

Hard requirements:
- Do not depend on a real Google account for CI.
- Do not weaken auth in production.
- Keep test-only auth helpers gated to test/development only.
- Cover actual user flows, not just unit logic.

Expected deliverables:
- Add Playwright or an equivalent browser E2E harness if the repo does not have one.
- Cover:
  - signed-out dashboard redirects to sign-in
  - backend unavailable message
  - local/test sign-in path
  - upload page validation
  - document detail tab navigation
  - Visual Notes Beta conditional rendering
  - keyboard navigation for core tabs/buttons
- Add accessibility checks where practical:
  - labels
  - focus order
  - keyboard access
  - color/contrast review notes

Acceptance criteria:
- E2E can run locally with deterministic fixtures.
- CI path is documented.
- No production-only auth bypass is introduced.

## Task 7: Frontend Resilience and Product Polish Rebuild

Goal: make the app feel reliable under slow, failed, or partial backend states.

Hard requirements:
- No blank screens for backend failures.
- No infinite loading when backend says failed.
- No hidden failure modes for auth expiration.
- No accidental homework-solving affordance.
- Visual Notes must be clearly separate from citations.

What to inspect:
- `frontend/src/app/(app)/documents/[id]/page.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/data/documents.ts`
- `frontend/src/lib/userMessages.ts`
- `frontend/src/app/signin/page.tsx`
- `frontend/src/app/(app)/upload/*`

Expected deliverables:
- Improve user-safe error states.
- Add retry affordances where appropriate.
- Add pure tests for state selectors and user messages.
- Audit responsive layout and text overflow.
- Ensure no UI copy suggests LearnEase solves assignments.

Acceptance criteria:
- Frontend tests cover key failed/loading states.
- Build passes.
- Manual browser QA shows no incoherent overlap or blank failure screens.

## Task 8: CI, Contract Drift, and Release Gate Upgrade

Goal: make GitHub catch drift and production-breaking changes earlier.

Hard requirements:
- CI should fail when canonical docs and frontend mirrors drift.
- CI should fail on type/lint/test/build issues.
- E2E with secrets should be explicit and isolated.
- Dependency updates should not silently break TypeScript again.

What to inspect:
- `.github/workflows/*`
- `frontend/scripts/check-canonical-contracts.mjs`
- `docs/*`
- `frontend/docs/*`
- package lockfiles

Expected deliverables:
- Add a docs mirror drift check if missing.
- Add or improve GitHub Actions for:
  - backend lint/build/test
  - frontend lint/test/type-check/build
  - backend E2E with isolated temp DB/artifacts
  - optional OpenAI integration only when secret exists
- Make workflow names and annotations clear.

Acceptance criteria:
- New CI catches the docs drift that currently had to be manually fixed.
- Workflows pass on `main`.

## Task 9: Security and Abuse Red-Team

Goal: aggressively look for ways the app can leak data, accept malicious files, or violate academic-integrity constraints.

Hard requirements:
- No raw uploads or extracted text in logs.
- No prompt injection from uploaded documents can override LearnEase policy.
- No uploaded file can escape artifact storage paths.
- MIME and signature validation must agree.
- Rate limits must protect expensive routes.

Expected deliverables:
- Red-team report with concrete findings and patches for high-risk issues.
- Tests for:
  - path traversal filenames
  - mismatched MIME/signature
  - oversized multipart edge cases
  - prompt injection attempting homework solving
  - malicious document text trying to override system prompt
  - rate limits on expensive generation routes

Acceptance criteria:
- Any high or medium issue found is fixed or documented with an explicit reason.
- Tests prove fixed vulnerabilities.

## Suggested Execution Order

1. Task 1: Phase 3A Visual Notes Beta red-team and hardening
2. Task 8: CI and contract drift gates
3. Task 2: Auth/session/CSRF hardening
4. Task 5: Generation reliability rebuild
5. Task 4: Data lifecycle and artifact integrity
6. Task 3: Deployment readiness
7. Task 6: Browser E2E and accessibility
8. Task 7: Frontend resilience
9. Task 9: Security and abuse red-team

## Required Review Output From Claude

For each task, return:

```markdown
## Summary
- What changed
- Why it changed

## Files Changed
- path: reason

## Verification
- command: result

## Risks / Follow-ups
- remaining risk
- suggested next task
```

Do not claim full system safety without listing commands actually run.
