# Options platform lane matrix (phase 2)

This matrix is a decision framework for selecting the first broker/API lane after paper rehearsal.
It intentionally separates facts we can automate from facts that require manual/legal verification.

Status legend:
- ready: known + validated in this repo
- partial: some integration path exists, verification still needed
- unknown: no verified implementation yet

## Goal

Choose one broker lane for the first real-data simulation sprint (not live order execution yet).

## Selection criteria

1) API + data feasibility (weight 30)
2) Options permissions workflow friction (weight 20)
3) Fee + slippage drag on micro trades (weight 20)
4) PDT/account-constraint compatibility (weight 15)
5) Existing nautilus_trader integration surface (weight 15)

## Candidate lanes (initial)

| Lane | API/data feasibility | Permission friction | Fee/slippage fit | PDT compatibility | Existing integration surface | Weighted score (0-100) | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Interactive Brokers (IBKR) | 8 | 6 | 7 | 7 | 9 | 74 | partial |
| Tastytrade | 7 | 7 | 7 | 7 | 5 | 67 | unknown |
| Tradier | 7 | 7 | 6 | 7 | 4 | 63 | unknown |
| Schwab/thinkorswim API lane | 6 | 6 | 7 | 7 | 3 | 58 | unknown |

Scoring formula:
weighted_score = sum(raw_score_criterion * weight) / 10

## Why IBKR is currently favored

- Existing options/greeks examples in this repo under `examples/live/interactive_brokers_v2/`.
- Lower implementation risk for replay + paper-validation path.
- Better near-term velocity versus starting from a net-new adapter lane.

## Hard go/no-go gates before lane lock

A lane cannot be selected until all are true:

1) Governance gate reproducible
   - options approval level gate
   - PDT-aware account gate
   - fee-adjusted net edge gate
   - weekly risk budget gate

2) Data coverage gate
   - underlying quote stream
   - option chain snapshots
   - greeks/IV availability or deterministic fallback

3) Execution realism gate (paper)
   - per-contract fee model parameterized
   - spread/slippage model parameterized
   - order rejection path simulated

4) Operator checklist gate
   - account-type confirmed (cash/margin)
   - options level confirmed
   - compliance disclaimer acknowledged

### Current gate status (IBKR lane, simulated scope)

- governance_reproducible: pass
- data_coverage: pass (validated by `options_data_coverage_gate.py` against smoke artifacts)
- execution_realism: pass (validated by `options_execution_realism_gate.py` with `reject` scenario)
- operator_checklist: pending

## Next implementation tasks tied to this matrix

1) Add lane-profile config (`options_lane_profiles.json`) with explicit, editable scores.
2) Add a lane selector helper script to rank lanes from config.
3) Add tests ensuring lane selection fails when any hard gate is missing.
4) Wire selected lane into autonomy runner as metadata only (still paper mode).

## Open questions

- Which broker account is already provisioned for options permissions now?
- Is first live-like rehearsal expected on cash or margin account?
- What fee schedule should be modeled per contract (base + exchange/regulatory)?

Until those are answered, this matrix is planning guidance and not production policy.
