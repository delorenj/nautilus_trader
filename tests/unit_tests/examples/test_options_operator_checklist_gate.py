# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------

import json
from pathlib import Path

from examples.live.options.options_operator_checklist_gate import evaluate_operator_checklist


def test_operator_checklist_blocks_when_missing_file(tmp_path: Path) -> None:
    result = evaluate_operator_checklist(tmp_path / "missing.json")
    assert result["blocked"] is True


def test_operator_checklist_passes_when_all_flags_confirmed(tmp_path: Path) -> None:
    checklist_path = tmp_path / "operator_checklist.json"
    checklist_path.write_text(
        json.dumps(
            {
                "account_type": "margin",
                "account_type_confirmed": True,
                "options_approval_level": 2,
                "options_approval_confirmed": True,
                "weekly_risk_limit_usd": 150,
                "compliance_disclaimer_acknowledged": True,
                "paper_mode_rehearsed": True,
            },
        ),
        encoding="utf-8",
    )

    result = evaluate_operator_checklist(checklist_path)
    assert result["blocked"] is False


def test_operator_checklist_blocks_when_any_flag_false(tmp_path: Path) -> None:
    checklist_path = tmp_path / "operator_checklist.json"
    checklist_path.write_text(
        json.dumps(
            {
                "account_type": "margin",
                "account_type_confirmed": False,
                "options_approval_level": 2,
                "options_approval_confirmed": True,
                "weekly_risk_limit_usd": 150,
                "compliance_disclaimer_acknowledged": True,
                "paper_mode_rehearsed": True,
            },
        ),
        encoding="utf-8",
    )

    result = evaluate_operator_checklist(checklist_path)
    assert result["blocked"] is True
