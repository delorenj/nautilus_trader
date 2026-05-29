#!/usr/bin/env python3
# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------
"""Execution-realism gate for options lane readiness."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def evaluate_execution_realism(var_dir: Path) -> dict[str, Any]:
    signals = _jsonl(var_dir / "signal_observations.jsonl")
    cycles = _jsonl(var_dir / "contract_cycles.jsonl")

    fee_param = False
    spread_param = False
    rejection_path = False

    if signals:
        latest = signals[-1]
        governance = latest.get("governance") or {}
        fees = governance.get("estimated_round_trip_fees_usd")
        fee_param = fees is not None and float(fees) > 0

        spread = latest.get("spread_bps")
        spread_param = spread is not None and float(spread) > 0

    if cycles:
        rejection_path = any(item.get("status") == "REJECTED" for item in cycles)

    checks = {
        "fee_model_parameterized": {
            "ok": fee_param,
            "reason": "governance estimated fee field present" if fee_param else "missing governance fee estimate",
        },
        "slippage_model_parameterized": {
            "ok": spread_param,
            "reason": "spread_bps present in signal observations" if spread_param else "missing spread_bps signal evidence",
        },
        "rejection_path_simulated": {
            "ok": rejection_path,
            "reason": "at least one cycle has status=REJECTED" if rejection_path else "no rejection cycle found",
        },
    }

    blocked = not all(item["ok"] for item in checks.values())
    return {
        "gate": "execution_realism",
        "blocked": blocked,
        "checks": checks,
        "var_dir": str(var_dir),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate options execution-realism gate.")
    parser.add_argument("--var-dir", type=Path, required=True)
    args = parser.parse_args()

    result = evaluate_execution_realism(args.var_dir)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
