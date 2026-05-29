# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------

import json
from decimal import Decimal
from pathlib import Path

from examples.live.options.options_lane_selector import LaneProfile
from examples.live.options.options_lane_selector import load_profiles
from examples.live.options.options_lane_selector import rank_lanes
from examples.live.options.options_lane_selector import select_primary_lane
from examples.live.options.options_lane_selector import weighted_score


def test_weighted_score_uses_configured_weights() -> None:
    score = weighted_score(
        {
            "api_data_feasibility": Decimal("8"),
            "permission_friction": Decimal("6"),
            "fee_slippage_fit": Decimal("7"),
            "pdt_compatibility": Decimal("7"),
            "integration_surface": Decimal("9"),
        },
    )

    assert score == Decimal("74.00")


def test_rank_lanes_marks_missing_gates_ineligible() -> None:
    lanes = [
        LaneProfile(
            name="ibkr",
            status="partial",
            scores={
                "api_data_feasibility": Decimal("8"),
                "permission_friction": Decimal("6"),
                "fee_slippage_fit": Decimal("7"),
                "pdt_compatibility": Decimal("7"),
                "integration_surface": Decimal("9"),
            },
            hard_gates={
                "governance_reproducible": True,
                "data_coverage": False,
                "execution_realism": False,
                "operator_checklist": False,
            },
            notes=[],
        ),
        LaneProfile(
            name="future-lane",
            status="ready",
            scores={
                "api_data_feasibility": Decimal("7"),
                "permission_friction": Decimal("7"),
                "fee_slippage_fit": Decimal("7"),
                "pdt_compatibility": Decimal("7"),
                "integration_surface": Decimal("6"),
            },
            hard_gates={
                "governance_reproducible": True,
                "data_coverage": True,
                "execution_realism": True,
                "operator_checklist": True,
            },
            notes=[],
        ),
    ]

    ranked = rank_lanes(lanes)
    selected = select_primary_lane(lanes)

    assert ranked[0].name == "ibkr"
    assert ranked[0].eligible is False
    assert "data_coverage" in ranked[0].missing_gates

    assert selected is not None
    assert selected.name == "future-lane"
    assert selected.eligible is True


def test_load_profiles_parses_json(tmp_path: Path) -> None:
    profile_path = tmp_path / "lane_profiles.json"
    profile_path.write_text(
        json.dumps(
            {
                "lanes": [
                    {
                        "name": "ibkr",
                        "status": "partial",
                        "scores": {
                            "api_data_feasibility": 8,
                            "permission_friction": 6,
                            "fee_slippage_fit": 7,
                            "pdt_compatibility": 7,
                            "integration_surface": 9,
                        },
                        "hard_gates": {
                            "governance_reproducible": True,
                            "data_coverage": False,
                            "execution_realism": False,
                            "operator_checklist": False,
                        },
                    },
                ],
            },
        ),
        encoding="utf-8",
    )

    profiles = load_profiles(profile_path)
    assert len(profiles) == 1
    assert profiles[0].name == "ibkr"
    assert profiles[0].scores["integration_surface"] == Decimal("9")
