#!/usr/bin/env python3
# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------
"""Operator checklist gate for options lane readiness."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

REQUIRED_BOOLEAN_FLAGS = (
    "account_type_confirmed",
    "options_approval_confirmed",
    "compliance_disclaimer_acknowledged",
    "paper_mode_rehearsed",
)


def evaluate_operator_checklist(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "gate": "operator_checklist",
            "blocked": True,
            "reason": f"checklist file missing: {path}",
            "checks": {},
            "path": str(path),
        }

    data = json.loads(path.read_text(encoding="utf-8"))
    checks: dict[str, dict[str, Any]] = {}

    for key in REQUIRED_BOOLEAN_FLAGS:
        value = bool(data.get(key, False))
        checks[key] = {
            "ok": value,
            "value": value,
        }

    has_account_type = data.get("account_type") in {"margin", "cash"}
    checks["account_type"] = {
        "ok": has_account_type,
        "value": data.get("account_type"),
    }

    has_weekly_limit = data.get("weekly_risk_limit_usd") is not None
    checks["weekly_risk_limit_usd"] = {
        "ok": has_weekly_limit,
        "value": data.get("weekly_risk_limit_usd"),
    }

    blocked = not all(item["ok"] for item in checks.values())
    return {
        "gate": "operator_checklist",
        "blocked": blocked,
        "checks": checks,
        "path": str(path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate operator checklist gate.")
    parser.add_argument(
        "--checklist",
        type=Path,
        default=Path("examples/live/options/options_operator_checklist.json"),
    )
    args = parser.parse_args()

    result = evaluate_operator_checklist(args.checklist)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
