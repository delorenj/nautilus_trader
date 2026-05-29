# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
#
#  Licensed under the GNU Lesser General Public License Version 3.0 (the "License");
#  You may not use this file except in compliance with the License.
#  You may obtain a copy of the License at https://www.gnu.org/licenses/lgpl-3.0.en.html
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
# -------------------------------------------------------------------------------------------------

import json
from decimal import Decimal
from pathlib import Path

from examples.live.kraken.kraken_spot_autonomy_bot import evaluate_signal
from examples.live.kraken.kraken_spot_autonomy_bot import generate_strategy_slate
from examples.live.kraken.kraken_spot_autonomy_bot import run_cycle
from examples.live.kraken.kraken_spot_autonomy_bot import run_cycles
from examples.live.kraken.kraken_spot_autonomy_bot import simulated_ticks
from examples.live.kraken.kraken_spot_autonomy_bot import write_runtime_state


def _jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_generate_strategy_slate_keeps_kraken_spot_scope() -> None:
    strategies = generate_strategy_slate(
        symbols=["BTC/USDT", "ETH/USDT"],
        lessons=[],
        risk_budget_usd=Decimal(25),
    )

    assert [strategy.rank for strategy in strategies] == [1, 2, 3, 4, 5]
    assert strategies[0].status == "selected"
    assert strategies[0].symbol == "BTC/USDT"
    assert strategies[0].domain == "crypto"
    assert strategies[0].risk_budget_usd == Decimal(25)


def test_evaluate_signal_rejects_tight_constraints_for_no_entry() -> None:
    strategy = generate_strategy_slate(
        symbols=["BTC/USDT"],
        lessons=[],
        risk_budget_usd=Decimal(25),
    )[0]
    signal = evaluate_signal(
        strategy,
        simulated_ticks("BTC/USDT", now=1_800_000_000, scenario="no-entry"),
        cycle_id="kraken-cycle-test",
    )

    assert signal.passed is False
    assert signal.reason.startswith("No entry")
    assert signal.instrument_id == "BTC/USDT.KRAKEN"


def test_run_cycle_writes_full_target_hit_feedback_loop(tmp_path: Path) -> None:
    summary = run_cycle(
        var_dir=tmp_path,
        symbols=["BTC/USDT", "ETH/USDT"],
        risk_budget_usd=Decimal(25),
        scenario="target",
        source="simulated",
        now=1_800_000_000,
    )

    assert summary["phase"] == "learn"
    assert summary["signal_passed"] is True
    assert summary["position_status"] == "CLOSED"

    strategies = _jsonl(tmp_path / "strategy_hypotheses.jsonl")
    decisions = _jsonl(tmp_path / "strategy_decisions.jsonl")
    signals = _jsonl(tmp_path / "signal_observations.jsonl")
    cycles = _jsonl(tmp_path / "contract_cycles.jsonl")
    postmortems = _jsonl(tmp_path / "contract_postmortems.jsonl")
    lessons = _jsonl(tmp_path / "strategy_lessons.jsonl")
    runtime = json.loads((tmp_path / "runtime_state.json").read_text(encoding="utf-8"))

    assert len(strategies) == 5
    assert decisions[0]["selected_strategy_id"] == "btcusdt-momentum-continuation"
    assert decisions[0]["hypotheses_count"] == 5
    assert decisions[0]["lessons_considered_count"] == 0
    assert decisions[0]["selected_reason"].startswith(
        "Picked BTC/USDT momentum continuation",
    )
    assert [score["id"] for score in decisions[0]["scoring"][0]["vector_scores"]] == [
        "signal_quality",
        "spread_discipline",
        "upside_capture",
        "downside_protection",
        "stale_exposure",
        "lesson_fit",
    ]
    assert signals[0]["passed"] is True
    assert cycles[0]["position"]["instrument_id"] == "BTC/USDT.KRAKEN"
    assert cycles[0]["position"]["close_reason"] == "target"
    assert postmortems[0]["result"] == "win"
    assert lessons[0]["action"] == "reinforce_target_hit_setup"
    assert runtime["phase"] == "learn"
    assert runtime["decision"]["selected_strategy_id"] == decisions[0]["selected_strategy_id"]
    assert runtime["decision"]["scoring"][0]["vector_scores"][0]["label"] == "Signal quality"
    assert runtime["position"]["close_reason"] == "target"
    assert runtime["lesson"]["action"] == "reinforce_target_hit_setup"


def test_run_cycle_writes_no_entry_feedback_loop(tmp_path: Path) -> None:
    summary = run_cycle(
        var_dir=tmp_path,
        symbols=["BTC/USDT"],
        risk_budget_usd=Decimal(25),
        scenario="no-entry",
        source="simulated",
        now=1_800_000_000,
    )

    assert summary["position_status"] == "NO_ENTRY"
    assert summary["lesson_action"] == "relax_one_entry_constraint"

    cycles = _jsonl(tmp_path / "contract_cycles.jsonl")
    postmortems = _jsonl(tmp_path / "contract_postmortems.jsonl")
    lessons = _jsonl(tmp_path / "strategy_lessons.jsonl")

    assert cycles[0]["status"] == "NO_ENTRY"
    assert cycles[0]["position"] is None
    assert postmortems[0]["result"] == "no_entry"
    assert lessons[0]["recommendation"].startswith("Loosen one constraint")

    runtime = json.loads((tmp_path / "runtime_state.json").read_text(encoding="utf-8"))

    assert runtime["phase"] == "learn"
    assert runtime["position"] is None
    assert runtime["status_line"].startswith("No entry recorded")


def test_run_cycle_uses_prior_lesson_in_next_strategy_decision(tmp_path: Path) -> None:
    run_cycle(
        var_dir=tmp_path,
        symbols=["BTC/USDT", "ETH/USDT"],
        risk_budget_usd=Decimal(25),
        scenario="target",
        source="simulated",
        now=1_800_000_000,
    )
    run_cycle(
        var_dir=tmp_path,
        symbols=["BTC/USDT", "ETH/USDT"],
        risk_budget_usd=Decimal(25),
        scenario="target",
        source="simulated",
        now=1_800_000_060,
    )

    decisions = _jsonl(tmp_path / "strategy_decisions.jsonl")
    runtime = json.loads((tmp_path / "runtime_state.json").read_text(encoding="utf-8"))

    assert decisions[1]["cycle_id"] == "kraken-cycle-0002"
    assert decisions[1]["lessons_considered_count"] == 1
    assert decisions[1]["lesson_influences"] == [
        "Target-hit lesson nudged the momentum setup higher without increasing size.",
    ]
    assert decisions[1]["scoring"][0]["lesson_adjustment"] == "target-hit reinforcement"
    assert decisions[1]["scoring"][0]["vector_scores"][-1]["score"] == 82.0
    assert runtime["decision"]["cycle_id"] == "kraken-cycle-0002"
    assert "Target-hit lesson" in runtime["decision"]["selected_reason"]


def test_write_runtime_state_exposes_visible_signal_phase(tmp_path: Path) -> None:
    strategies = generate_strategy_slate(
        symbols=["BTC/USDT"],
        lessons=[],
        risk_budget_usd=Decimal(25),
    )
    signal = evaluate_signal(
        strategies[0],
        simulated_ticks("BTC/USDT", now=1_800_000_000, scenario="target"),
        cycle_id="kraken-cycle-test",
    )

    write_runtime_state(
        var_dir=tmp_path,
        cycle_id="kraken-cycle-test",
        cycle_number=7,
        phase="signal_watch",
        status_line=signal.reason,
        strategies=strategies,
        selected_strategy_id=strategies[0].id,
        signal=signal,
        updated_ts=signal.created_ts,
    )

    runtime = json.loads((tmp_path / "runtime_state.json").read_text(encoding="utf-8"))

    assert runtime["phase"] == "signal_watch"
    assert runtime["cycle_number"] == 7
    assert runtime["signal"]["passed"] is True
    assert runtime["position"] is None


def test_learn_status_line_names_each_cycle_outcome(tmp_path: Path) -> None:
    scenarios = {
        "target": "Target-hit postmortem",
        "stop": "Stop-loss postmortem",
        "timebox": "Timebox postmortem",
        "no-entry": "No entry recorded",
    }

    for scenario, expected in scenarios.items():
        scenario_dir = tmp_path / scenario
        run_cycle(
            var_dir=scenario_dir,
            symbols=["BTC/USDT", "ETH/USDT"],
            risk_budget_usd=Decimal(25),
            scenario=scenario,
            source="simulated",
            now=1_800_000_000,
        )
        postmortem = _jsonl(scenario_dir / "contract_postmortems.jsonl")[0]
        runtime = json.loads(
            (scenario_dir / "runtime_state.json").read_text(encoding="utf-8"),
        )

        assert runtime["status_line"].startswith(expected)
        assert postmortem["cycle_id"] == runtime["cycle_id"]


def test_run_cycles_repeats_full_feedback_loop_with_scenario_sequence(tmp_path: Path) -> None:
    summary = run_cycles(
        var_dir=tmp_path,
        symbols=["BTC/USDT", "ETH/USDT"],
        risk_budget_usd=Decimal(25),
        scenario="target",
        scenario_sequence=["target", "no-entry", "stop"],
        source="simulated",
        cycle_count=3,
        now=1_800_000_000,
    )

    cycles = _jsonl(tmp_path / "contract_cycles.jsonl")
    postmortems = _jsonl(tmp_path / "contract_postmortems.jsonl")
    lessons = _jsonl(tmp_path / "strategy_lessons.jsonl")
    runbooks = _jsonl(tmp_path / "session_runbooks.jsonl")
    runtime = json.loads((tmp_path / "runtime_state.json").read_text(encoding="utf-8"))
    runbook = json.loads((tmp_path / "session_runbook.json").read_text(encoding="utf-8"))

    assert summary["cycle_count"] == 3
    assert summary["scenario_sequence"] == ["target", "no-entry", "stop"]
    assert summary["last_lesson_action"] == "cooldown_symbol_after_loss"
    assert summary["next_cycle_scenario"] == "no-entry"
    assert summary["next_cycle_recommendation"].startswith("Cool down")
    assert len(summary["completed_cycles"]) == 3
    assert [cycle["cycle_id"] for cycle in cycles] == [
        "kraken-cycle-0001",
        "kraken-cycle-0002",
        "kraken-cycle-0003",
    ]
    assert [postmortem["result"] for postmortem in postmortems] == [
        "win",
        "no_entry",
        "loss",
    ]
    assert [lesson["action"] for lesson in lessons] == [
        "reinforce_target_hit_setup",
        "relax_one_entry_constraint",
        "cooldown_symbol_after_loss",
    ]
    assert runbooks[0]["cycle_count"] == 3
    assert runbooks[0]["wins"] == 1
    assert runbooks[0]["losses"] == 1
    assert runbooks[0]["no_entries"] == 1
    assert runbooks[0]["cycle_trace"][1]["result"] == "no_entry"
    assert runbook["session_id"] == runbooks[0]["session_id"]
    assert runbook["next_cycle_scenario"] == "no-entry"
    assert runtime["cycle_id"] == "kraken-cycle-0003"
    assert runtime["phase"] == "learn"
