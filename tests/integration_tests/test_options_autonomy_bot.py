# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------

import json
from decimal import Decimal
from pathlib import Path

from examples.live.options.options_autonomy_bot import generate_strategy_slate
from examples.live.options.options_autonomy_bot import run_cycle
from examples.live.options.options_autonomy_bot import run_cycles


def _jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_generate_strategy_slate_ranks_contracts_by_edge() -> None:
    strategies = generate_strategy_slate(
        symbols=["SPY"],
        lessons=[],
        risk_budget_usd=Decimal(25),
        scenario="target",
        now=1_800_000_000,
    )

    assert len(strategies) == 5
    assert [strategy.rank for strategy in strategies] == [1, 2, 3, 4, 5]
    assert strategies[0].status == "selected"
    assert strategies[0].domain == "options"
    assert strategies[0].edge_bps >= strategies[-1].edge_bps


def test_run_cycle_no_entry_branch_writes_feedback_loop(tmp_path: Path) -> None:
    summary = run_cycle(
        var_dir=tmp_path,
        symbols=["SPY"],
        risk_budget_usd=Decimal(25),
        scenario="no-entry",
        source="simulated",
        now=1_800_000_000,
    )

    assert summary["phase"] == "learn"
    assert summary["position_status"] == "NO_ENTRY"
    assert summary["lesson_action"] == "relax_one_entry_constraint"

    cycles = _jsonl(tmp_path / "contract_cycles.jsonl")
    postmortems = _jsonl(tmp_path / "contract_postmortems.jsonl")
    lessons = _jsonl(tmp_path / "strategy_lessons.jsonl")
    runtime = json.loads((tmp_path / "runtime_state.json").read_text(encoding="utf-8"))

    assert cycles[0]["status"] == "NO_ENTRY"
    assert cycles[0]["position"] is None
    assert postmortems[0]["result"] == "no_entry"
    assert lessons[0]["action"] == "relax_one_entry_constraint"
    assert runtime["phase"] == "learn"


def test_run_cycle_target_writes_full_artifact_loop(tmp_path: Path) -> None:
    summary = run_cycle(
        var_dir=tmp_path,
        symbols=["SPY"],
        risk_budget_usd=Decimal(25),
        scenario="target",
        source="simulated",
        now=1_800_000_000,
    )

    assert summary["phase"] == "learn"
    assert summary["signal_passed"] is True
    assert summary["position_status"] == "CLOSED"
    assert summary["position_close_reason"] == "target"

    strategies = _jsonl(tmp_path / "strategy_hypotheses.jsonl")
    decisions = _jsonl(tmp_path / "strategy_decisions.jsonl")
    signals = _jsonl(tmp_path / "signal_observations.jsonl")
    cycles = _jsonl(tmp_path / "contract_cycles.jsonl")
    postmortems = _jsonl(tmp_path / "contract_postmortems.jsonl")
    lessons = _jsonl(tmp_path / "strategy_lessons.jsonl")
    runtime = json.loads((tmp_path / "runtime_state.json").read_text(encoding="utf-8"))

    assert len(strategies) == 5
    assert decisions[0]["hypotheses_count"] == 5
    assert decisions[0]["governance"]["blocked"] is False
    assert signals[0]["passed"] is True
    assert cycles[0]["position"]["close_reason"] == "target"
    assert postmortems[0]["result"] == "win"
    assert lessons[0]["action"] == "reinforce_micro_edge_setup"
    assert runtime["phase"] == "learn"


def test_run_cycle_target_governance_block_forces_no_entry(tmp_path: Path) -> None:
    summary = run_cycle(
        var_dir=tmp_path,
        symbols=["SPY"],
        risk_budget_usd=Decimal(25),
        scenario="target",
        source="simulated",
        now=1_800_000_000,
        account_type="margin",
        account_equity_usd=Decimal("12000"),
        round_trips_5d=4,
        options_approval_level=1,
    )

    signals = _jsonl(tmp_path / "signal_observations.jsonl")
    cycles = _jsonl(tmp_path / "contract_cycles.jsonl")

    assert summary["signal_passed"] is False
    assert summary["position_status"] == "NO_ENTRY"
    assert summary["governance_blocked"] is True
    assert signals[0]["governance"]["blocked"] is True
    assert cycles[0]["status"] == "NO_ENTRY"


def test_run_cycle_reject_branch_marks_rejection_status(tmp_path: Path) -> None:
    summary = run_cycle(
        var_dir=tmp_path,
        symbols=["SPY"],
        risk_budget_usd=Decimal(25),
        scenario="reject",
        source="simulated",
        now=1_800_000_000,
    )

    cycles = _jsonl(tmp_path / "contract_cycles.jsonl")
    postmortems = _jsonl(tmp_path / "contract_postmortems.jsonl")
    lessons = _jsonl(tmp_path / "strategy_lessons.jsonl")

    assert summary["signal_passed"] is True
    assert summary["position_status"] == "REJECTED"
    assert summary["position_close_reason"] == "order_rejected"
    assert cycles[0]["status"] == "REJECTED"
    assert postmortems[0]["result"] == "rejected"
    assert lessons[0]["action"] == "review_execution_constraints_after_rejection"


def test_run_cycles_writes_session_summary(tmp_path: Path) -> None:
    summary = run_cycles(
        var_dir=tmp_path,
        symbols=["SPY"],
        risk_budget_usd=Decimal(25),
        scenario="target",
        scenario_sequence=["target", "no-entry", "stop"],
        source="simulated",
        cycle_count=3,
        now=1_800_000_000,
    )

    cycles = _jsonl(tmp_path / "contract_cycles.jsonl")
    runbooks = _jsonl(tmp_path / "session_runbooks.jsonl")
    runbook = json.loads((tmp_path / "session_runbook.json").read_text(encoding="utf-8"))

    assert summary["cycle_count"] == 3
    assert summary["scenario_sequence"] == ["target", "no-entry", "stop"]
    assert len(summary["completed_cycles"]) == 3
    assert summary["rejections"] == 0
    assert [cycle["cycle_id"] for cycle in cycles] == [
        "options-cycle-0001",
        "options-cycle-0002",
        "options-cycle-0003",
    ]
    assert runbook["cycle_count"] == 3
    assert runbooks[-1]["cycle_count"] == 3
