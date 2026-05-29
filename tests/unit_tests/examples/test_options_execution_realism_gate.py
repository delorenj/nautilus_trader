# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------

import json
from pathlib import Path

from examples.live.options.options_execution_realism_gate import evaluate_execution_realism


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")


def test_execution_realism_blocked_without_rejection_path(tmp_path: Path) -> None:
    _write_jsonl(
        tmp_path / "signal_observations.jsonl",
        [
            {
                "spread_bps": 320,
                "governance": {"estimated_round_trip_fees_usd": 1.3},
            },
        ],
    )
    _write_jsonl(tmp_path / "contract_cycles.jsonl", [{"status": "CLOSED"}])

    result = evaluate_execution_realism(tmp_path)
    assert result["blocked"] is True
    assert result["checks"]["rejection_path_simulated"]["ok"] is False


def test_execution_realism_passes_with_fee_spread_and_rejection(tmp_path: Path) -> None:
    _write_jsonl(
        tmp_path / "signal_observations.jsonl",
        [
            {
                "spread_bps": 280,
                "governance": {"estimated_round_trip_fees_usd": 1.3},
            },
        ],
    )
    _write_jsonl(tmp_path / "contract_cycles.jsonl", [{"status": "REJECTED"}])

    result = evaluate_execution_realism(tmp_path)
    assert result["blocked"] is False
    assert result["checks"]["fee_model_parameterized"]["ok"] is True
    assert result["checks"]["slippage_model_parameterized"]["ok"] is True
    assert result["checks"]["rejection_path_simulated"]["ok"] is True
