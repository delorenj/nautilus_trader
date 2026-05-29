# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------

from pathlib import Path

from examples.live.options.options_data_coverage_gate import evaluate_data_coverage
from examples.live.options.options_data_coverage_gate import validate_chain_rows


def _row() -> dict:
    return {
        "contract_id": "SPY-7D-500-C",
        "symbol": "SPY",
        "option_kind": "call",
        "strike": 500,
        "expiry_days": 7,
        "spot": 500,
        "bid": 2.5,
        "ask": 2.7,
        "mark_iv": 0.24,
        "risk_free_rate": 0.04,
    }


def test_validate_chain_rows_passes_when_schema_and_iv_present() -> None:
    result = validate_chain_rows([_row()])
    assert result["ok"] is True
    assert result["missing_fields"] == []
    assert result["rows_with_zero_or_missing_iv"] == 0


def test_validate_chain_rows_fails_on_missing_fields() -> None:
    bad = _row()
    bad.pop("mark_iv")
    result = validate_chain_rows([bad])
    assert result["ok"] is False
    assert "mark_iv" in result["missing_fields"]


def test_evaluate_data_coverage_blocks_if_required_artifacts_missing(tmp_path: Path) -> None:
    result = evaluate_data_coverage(chain_rows=[_row()], var_dir=tmp_path)
    assert result["blocked"] is True
    assert result["artifacts"]["ok"] is False


def test_evaluate_data_coverage_passes_when_artifacts_present(tmp_path: Path) -> None:
    for name in (
        "strategy_hypotheses.jsonl",
        "strategy_decisions.jsonl",
        "signal_observations.jsonl",
    ):
        (tmp_path / name).write_text("{}\n", encoding="utf-8")

    result = evaluate_data_coverage(chain_rows=[_row()], var_dir=tmp_path)
    assert result["blocked"] is False
    assert result["artifacts"]["ok"] is True
    assert result["chain"]["ok"] is True
