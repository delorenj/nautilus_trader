# Kraken Spot Live Submitter Implementation Plan

> For Hermes: use `subagent-driven-development` in kanban-orchestrated mode (WIP=1) with a spec review gate and a quality review gate after each task.

## Goal

Move the Kraken Spot autonomy path from descriptor-only dry-run to a minimal, auditable live submitter path while keeping paper mode as the safe default.

## Current context / assumptions

Assumption (because `/plan` was invoked without a scoped feature request): this plan targets the next obvious milestone in current repo work — Kraken Spot autonomy live execution readiness.

Grounded context from current code:
- `polymarket/dashboard/web/lib/autonomy/execution-submit.ts` currently records attempts and reconciliations, but never submits (`submitted: false` in all branches).
- `polymarket/dashboard/web/lib/autonomy/live-executor.ts` provides a descriptor contract with `submissionAllowed: false` and `submitterImplemented: false`.
- `polymarket/dashboard/web/lib/autonomy/live-readiness.ts` includes acceptance checks and currently expects a `live-submitter` blocker.
- API routes already exist for readiness/intent/submit under `polymarket/dashboard/web/app/api/autonomy/*`.
- Documentation and checklist files already define the intended safety envelope:
  - `examples/live/kraken/KRAKEN_SPOT_AUTONOMY.md`
  - `examples/live/kraken/KRAKEN_SPOT_GO_LIVE_CHECKLIST.md`

## Proposed approach

Implement a thin, testable live submitter seam behind explicit env gates and hard validation.

1) Keep default behavior paper/dry-run.
2) Add a live-submit path that is only reachable when all gates pass.
3) Persist full reconciliation artifacts required by the checklist.
4) Keep secrets redacted in all outputs.

## Step-by-step plan

### Task 1: Introduce a submitter interface and dependency seam

Objective: decouple live Kraken submission logic from `execution-submit.ts` so it can be mocked in tests.

Files:
- Create: `polymarket/dashboard/web/lib/autonomy/kraken-live-submitter.ts`
- Modify: `polymarket/dashboard/web/lib/autonomy/execution-submit.ts`
- Modify: `polymarket/dashboard/web/lib/autonomy/live-executor.ts`

Implementation notes:
- Define a narrow submitter contract (submit entry, register exits, return normalized IDs/timestamps/fill hints/errors).
- Keep transport/client creation abstracted behind injected dependency.
- Ensure descriptor metadata can flip `submitterImplemented` when implementation is present.

Verification:
- `pnpm --dir polymarket/dashboard/web test:run -- lib/autonomy/execution-submit.test.ts`

### Task 2: Add pre-submit hard validation for live path

Objective: enforce allowlist/risk/shape constraints before any submission call.

Files:
- Modify: `polymarket/dashboard/web/lib/autonomy/execution-submit.ts`
- Modify: `polymarket/dashboard/web/lib/autonomy/execution-intent.ts` (only if additional intent fields are required)
- Modify: `polymarket/dashboard/web/lib/autonomy/live-readiness.ts` (for shared gating helpers, if needed)

Implementation notes:
- Validate symbol allowlist, notional caps, quantity/price presence, and required gate states.
- Return explicit blockers for every failed precondition.
- Keep live attempts non-submitting when any validation fails.

Verification:
- `pnpm --dir polymarket/dashboard/web test:run -- lib/autonomy/execution-intent.test.ts lib/autonomy/execution-submit.test.ts`

### Task 3: Implement live submission attempt path

Objective: support a true `mode: "live"` path that can set `submitted: true` on successful entry submission.

Files:
- Modify: `polymarket/dashboard/web/lib/autonomy/execution-submit.ts`
- Modify: `polymarket/dashboard/web/lib/autonomy/kraken-live-submitter.ts`

Implementation notes:
- Add explicit status branch (e.g. live submitted vs live blocked/failed) without breaking existing dry-run behavior.
- Capture entry order identifiers, acceptance timestamps, and returned metadata.
- Keep failure semantics explicit and auditable (no silent fallback to success-like states).

Verification:
- `pnpm --dir polymarket/dashboard/web test:run -- lib/autonomy/execution-submit.test.ts`

### Task 4: Expand reconciliation artifacts for live fills

Objective: persist reconciliation shape required by Phase 4 checklist (fees, slippage, realized PnL, fill details).

Files:
- Modify: `polymarket/dashboard/web/lib/autonomy/execution-submit.ts`
- Modify: `polymarket/dashboard/web/lib/autonomy/types.ts` (if shared types must expose new fields)

Implementation notes:
- Store both entry and exit fill legs with `source: "kraken_live"` for live submissions.
- Gate postmortem readiness on actual reconciliation completion.
- Keep dry-run reconciliation behavior unchanged.

Verification:
- `pnpm --dir polymarket/dashboard/web test:run -- lib/autonomy/execution-submit.test.ts`

### Task 5: Align readiness checklist with implemented submitter

Objective: update readiness acceptance so `live-submitter` can pass when implementation and safeguards are present.

Files:
- Modify: `polymarket/dashboard/web/lib/autonomy/live-readiness.ts`
- Modify: `polymarket/dashboard/web/lib/autonomy/live-readiness.test.ts`

Implementation notes:
- Keep go-live blocked unless operator/env/evidence checks still pass.
- Ensure checklist status remains conservative by default.

Verification:
- `pnpm --dir polymarket/dashboard/web test:run -- lib/autonomy/live-readiness.test.ts`

### Task 6: Wire API route behavior and payload stability

Objective: ensure `/api/autonomy/execution-submit` returns stable, explicit states for dry-run vs live.

Files:
- Modify: `polymarket/dashboard/web/app/api/autonomy/execution-submit/route.ts`
- Modify: `polymarket/dashboard/web/app/api/autonomy/execution-intent/route.ts` (only if intent response must include new fields)

Implementation notes:
- Keep status codes deterministic and meaningful for UI polling.
- Ensure no secret values leak via route payloads.

Verification:
- `pnpm --dir polymarket/dashboard/web test:run -- lib/autonomy/execution-submit.test.ts`

### Task 7: Add/expand tests for happy-path and guardrails

Objective: cover live success, blocked live, and redaction scenarios.

Files:
- Modify: `polymarket/dashboard/web/lib/autonomy/execution-submit.test.ts`
- Modify: `polymarket/dashboard/web/lib/autonomy/live-readiness.test.ts`
- Add (if needed): `polymarket/dashboard/web/lib/autonomy/kraken-live-submitter.test.ts`

Implementation notes:
- Mock submitter responses for deterministic order IDs/timestamps.
- Add explicit assertions for `submitted` transitions and blocker lists.
- Assert secrets are absent from serialized artifacts and response details.

Verification:
- `pnpm --dir polymarket/dashboard/web test:run -- lib/autonomy/live-readiness.test.ts lib/autonomy/execution-intent.test.ts lib/autonomy/execution-submit.test.ts`

### Task 8: Update operator docs and go-live checklist references

Objective: keep docs aligned with implemented behavior and safety gates.

Files:
- Modify: `examples/live/kraken/KRAKEN_SPOT_AUTONOMY.md`
- Modify: `examples/live/kraken/KRAKEN_SPOT_GO_LIVE_CHECKLIST.md`

Implementation notes:
- Document exact env flags and expected artifact fields for live attempts.
- Clarify paper default and rollback/kill-switch behavior.

Verification:
- Manual doc sanity pass for consistency with API and test assertions.

## Files likely to change (consolidated)

- `polymarket/dashboard/web/lib/autonomy/execution-submit.ts`
- `polymarket/dashboard/web/lib/autonomy/live-executor.ts`
- `polymarket/dashboard/web/lib/autonomy/live-readiness.ts`
- `polymarket/dashboard/web/lib/autonomy/execution-intent.ts`
- `polymarket/dashboard/web/lib/autonomy/types.ts` (if needed)
- `polymarket/dashboard/web/lib/autonomy/execution-submit.test.ts`
- `polymarket/dashboard/web/lib/autonomy/live-readiness.test.ts`
- `polymarket/dashboard/web/lib/autonomy/execution-intent.test.ts`
- `polymarket/dashboard/web/lib/autonomy/kraken-live-submitter.ts` (new)
- `polymarket/dashboard/web/lib/autonomy/kraken-live-submitter.test.ts` (optional new)
- `polymarket/dashboard/web/app/api/autonomy/execution-submit/route.ts`
- `examples/live/kraken/KRAKEN_SPOT_AUTONOMY.md`
- `examples/live/kraken/KRAKEN_SPOT_GO_LIVE_CHECKLIST.md`

## Tests / validation

Primary:
- `pnpm --dir polymarket/dashboard/web test:run -- lib/autonomy/live-readiness.test.ts lib/autonomy/execution-intent.test.ts lib/autonomy/execution-submit.test.ts`

Broader safety net:
- `pnpm --dir polymarket/dashboard/web test:run`
- `.venv/bin/python -m pytest tests/integration_tests/adapters/kraken/test_spot_autonomy_bot.py tests/integration_tests/adapters/kraken/test_spot_operator_tui.py`

## Risks, tradeoffs, open questions

Risks:
- Live submission integration can create false confidence if reconciliation is partial.
- Kraken-specific edge cases (partial fills, precision/cost minimum mismatches, rate-limit retries) can break naive implementations.
- Event/audit shape drift between artifacts and UI may cause operator confusion.

Tradeoffs:
- Thin submitter seam + strict validation is slower to ship than direct inline calls, but far safer and easier to test.
- Keeping paper-first defaults may feel conservative, but it preserves rollback safety and minimizes accidental real-money exposure.

Open questions:
1. Should the first live implementation submit entry only and defer exit submission until entry fill reconciliation, or place bracket exits immediately after acceptance?
2. What retry/backoff policy should be allowed for Kraken submit/poll/cancel in the first canary?
3. Should live attempt artifacts be mirrored into a dedicated ledger file for easier postmortem slicing?
4. What exact acceptance threshold flips `KRAKEN_SPOT_CANARY_REVIEW_APPROVED=true` in practice?
