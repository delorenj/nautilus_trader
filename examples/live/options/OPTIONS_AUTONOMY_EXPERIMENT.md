# Options autonomy experiment (paper-only)

This workflow is a controlled paper-trading experiment for micro-sized options scalping.
It does not submit live orders.

## Why this exists

The goal is to rehearse a repeatable, emotion-free options process with strict loss controls:
- scan contracts
- enforce entry gates
- simulate exits
- review outcomes
- learn and adapt

## Five phases

1) strategize_scan
- Build a deterministic options scan.
- Compute Black-Scholes theoretical premium per contract.
- Rank contracts by edge (`theoretical - ask`) and spread discipline.

2) signal_watch
- Apply hard gates before any entry:
  - minimum edge
  - maximum spread
  - micro contract count
- Apply governance gates before entry:
  - options approval level
  - PDT-aware account checks (margin < $25k + day-trade window)
  - weekly risk budget cap
  - fee-adjusted net-edge threshold

3) monitor_exit
- Paper-only entry and exit path simulation.
- Scenario branches: `target`, `stop`, `timebox`, `no-entry`, `reject`.

4) postmortem
- Capture outcome and what happened.

5) learn
- Write one lesson for next cycle.

## Artifacts written

Default directory: `var/options_autonomy`

- `runtime_state.json`
- `strategy_hypotheses.jsonl`
- `strategy_decisions.jsonl` (includes governance decision snapshot)
- `signal_observations.jsonl` (includes governance gate result per cycle)
- `contract_cycles.jsonl`
- `contract_postmortems.jsonl`
- `strategy_lessons.jsonl`
- `session_runbook.json` (for multi-cycle runs)
- `session_runbooks.jsonl` (for multi-cycle runs)

## Run one cycle

```bash
.venv/bin/python examples/live/options/options_autonomy_bot.py \
  --source simulated \
  --scenario target \
  --symbol SPY \
  --risk-budget-usd 25 \
  --account-type margin \
  --account-equity-usd 30000 \
  --round-trips-5d 1 \
  --options-approval-level 2 \
  --fee-per-contract-usd 0.65 \
  --weekly-risk-limit-usd 150
```

## Run a multi-cycle rehearsal

```bash
.venv/bin/python examples/live/options/options_autonomy_bot.py \
  --source simulated \
  --scenario target \
  --scenario-sequence target,no-entry,stop,timebox \
  --cycle-count 4 \
  --symbol SPY \
  --risk-budget-usd 25
```

## Run a governance-blocked rehearsal (PDT/approval fail)

```bash
.venv/bin/python examples/live/options/options_autonomy_bot.py \
  --source simulated \
  --scenario target \
  --symbol SPY \
  --risk-budget-usd 25 \
  --account-type margin \
  --account-equity-usd 12000 \
  --round-trips-5d 4 \
  --options-approval-level 1
```

## Run an execution-rejection rehearsal

```bash
.venv/bin/python examples/live/options/options_autonomy_bot.py \
  --source simulated \
  --scenario reject \
  --symbol SPY \
  --risk-budget-usd 25
```

## Phase 2 lane-selection artifacts

- `examples/live/options/OPTIONS_PLATFORM_LANE_MATRIX.md`
- `examples/live/options/options_lane_profiles.json`
- `examples/live/options/options_lane_selector.py`
- `examples/live/options/options_data_coverage_gate.py`
- `examples/live/options/options_execution_realism_gate.py`

Run lane ranking:

```bash
.venv/bin/python examples/live/options/options_lane_selector.py
```

Run data coverage gate check:

```bash
.venv/bin/python examples/live/options/options_data_coverage_gate.py \
  --symbol SPY \
  --scenario target \
  --var-dir var/options_autonomy_smoke_governance
```

Run execution realism gate check:

```bash
.venv/bin/python examples/live/options/options_execution_realism_gate.py \
  --var-dir var/options_autonomy_smoke_reject
```

## Safety boundaries

- Paper mode only.
- Micro budget defaults (`risk_budget_usd` kept small).
- No live broker credentials required.
- No API order submission path in this module.

## Notes

This is an experiment harness for scanning and decision logic, not an income guarantee.
Use it to test rule quality and discipline before any live-execution discussion.
