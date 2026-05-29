#!/usr/bin/env python3
# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------
"""Data-coverage gate for options lane readiness."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from decimal import Decimal
from pathlib import Path
from typing import Any

try:
    from examples.live.options.options_autonomy_bot import simulated_option_chain
except ModuleNotFoundError:  # direct script execution path
    from options_autonomy_bot import simulated_option_chain

REQUIRED_CHAIN_FIELDS = (
    "contract_id",
    "symbol",
    "option_kind",
    "strike",
    "expiry_days",
    "spot",
    "bid",
    "ask",
    "mark_iv",
    "risk_free_rate",
)

REQUIRED_ARTIFACTS = (
    "strategy_hypotheses.jsonl",
    "strategy_decisions.jsonl",
    "signal_observations.jsonl",
)


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Unsupported JSON value: {value!r}")


def validate_chain_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {
            "ok": False,
            "reason": "option_chain_empty",
            "missing_fields": list(REQUIRED_CHAIN_FIELDS),
            "row_count": 0,
            "rows_with_issues": 0,
        }

    missing: set[str] = set()
    rows_with_issues = 0
    iv_missing_or_zero = 0

    for row in rows:
        row_issue = False
        for field in REQUIRED_CHAIN_FIELDS:
            if field not in row or row[field] is None:
                missing.add(field)
                row_issue = True
        if "mark_iv" in row:
            try:
                if Decimal(str(row["mark_iv"])) <= 0:
                    iv_missing_or_zero += 1
                    row_issue = True
            except Exception:
                iv_missing_or_zero += 1
                row_issue = True

        if row_issue:
            rows_with_issues += 1

    return {
        "ok": len(missing) == 0 and iv_missing_or_zero == 0,
        "reason": "ok" if len(missing) == 0 and iv_missing_or_zero == 0 else "chain_schema_or_iv_incomplete",
        "missing_fields": sorted(missing),
        "row_count": len(rows),
        "rows_with_issues": rows_with_issues,
        "rows_with_zero_or_missing_iv": iv_missing_or_zero,
    }


def validate_artifact_presence(var_dir: Path) -> dict[str, Any]:
    missing = [name for name in REQUIRED_ARTIFACTS if not (var_dir / name).exists()]
    return {
        "ok": len(missing) == 0,
        "missing_artifacts": missing,
        "var_dir": str(var_dir),
    }


def evaluate_data_coverage(*, chain_rows: list[dict[str, Any]], var_dir: Path) -> dict[str, Any]:
    chain = validate_chain_rows(chain_rows)
    artifacts = validate_artifact_presence(var_dir)

    blocked = not (chain["ok"] and artifacts["ok"])
    return {
        "blocked": blocked,
        "chain": chain,
        "artifacts": artifacts,
        "gate": "data_coverage",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate options data coverage gate.")
    parser.add_argument("--symbol", default="SPY")
    parser.add_argument("--scenario", default="target", choices=("target", "stop", "timebox", "no-entry", "reject"))
    parser.add_argument("--var-dir", type=Path, default=Path("var/options_autonomy"))
    parser.add_argument("--now", type=int, default=1_800_000_000)
    args = parser.parse_args()

    rows = [asdict(item) for item in simulated_option_chain(args.symbol.upper(), args.now, args.scenario)]
    result = evaluate_data_coverage(chain_rows=rows, var_dir=args.var_dir)
    print(json.dumps(result, default=_json_default, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
