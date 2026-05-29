#!/usr/bin/env python3
# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------
"""Score and select options broker lanes for phased rollout planning."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

try:
    from examples.live.options.options_operator_checklist_gate import evaluate_operator_checklist
except ModuleNotFoundError:  # direct script execution path
    from options_operator_checklist_gate import evaluate_operator_checklist

DEFAULT_PROFILES_PATH = Path("examples/live/options/options_lane_profiles.json")
DEFAULT_CHECKLIST_PATH = Path("examples/live/options/options_operator_checklist.json")

WEIGHTS: dict[str, int] = {
    "api_data_feasibility": 30,
    "permission_friction": 20,
    "fee_slippage_fit": 20,
    "pdt_compatibility": 15,
    "integration_surface": 15,
}

REQUIRED_GATES = (
    "governance_reproducible",
    "data_coverage",
    "execution_realism",
    "operator_checklist",
)


@dataclass(frozen=True)
class LaneProfile:
    name: str
    status: str
    scores: dict[str, Decimal]
    hard_gates: dict[str, bool]
    notes: list[str]


@dataclass(frozen=True)
class LaneRank:
    name: str
    weighted_score: Decimal
    eligible: bool
    status: str
    missing_gates: list[str]


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def weighted_score(scores: dict[str, Decimal], weights: dict[str, int] | None = None) -> Decimal:
    active_weights = weights or WEIGHTS
    total = Decimal("0")
    for key, weight in active_weights.items():
        total += scores[key] * Decimal(weight)
    return _q2(total / Decimal("10"))


def rank_lanes(profiles: list[LaneProfile]) -> list[LaneRank]:
    ranked: list[LaneRank] = []
    for profile in profiles:
        missing = [gate for gate in REQUIRED_GATES if not profile.hard_gates.get(gate, False)]
        ranked.append(
            LaneRank(
                name=profile.name,
                weighted_score=weighted_score(profile.scores),
                eligible=(len(missing) == 0),
                status=profile.status,
                missing_gates=missing,
            ),
        )

    ranked.sort(key=lambda item: item.weighted_score, reverse=True)
    return ranked


def select_primary_lane(profiles: list[LaneProfile]) -> LaneRank | None:
    ranked = rank_lanes(profiles)
    eligible = [lane for lane in ranked if lane.eligible]
    return eligible[0] if eligible else None


def load_profiles(path: Path) -> list[LaneProfile]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    profiles: list[LaneProfile] = []

    for row in raw.get("lanes", []):
        profiles.append(
            LaneProfile(
                name=row["name"],
                status=row.get("status", "unknown"),
                scores={key: Decimal(str(value)) for key, value in row["scores"].items()},
                hard_gates={key: bool(value) for key, value in row.get("hard_gates", {}).items()},
                notes=row.get("notes", []),
            ),
        )

    return profiles


def apply_operator_checklist_gate(
    profiles: list[LaneProfile],
    checklist_path: Path,
    lane_name: str,
) -> tuple[list[LaneProfile], dict[str, Any]]:
    gate = evaluate_operator_checklist(checklist_path)
    updated: list[LaneProfile] = []

    for profile in profiles:
        if profile.name != lane_name:
            updated.append(profile)
            continue

        gates = dict(profile.hard_gates)
        gates["operator_checklist"] = not gate.get("blocked", True)
        updated.append(
            LaneProfile(
                name=profile.name,
                status=profile.status,
                scores=profile.scores,
                hard_gates=gates,
                notes=profile.notes,
            ),
        )

    return updated, gate


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Unsupported JSON value: {value!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Rank options broker lanes by weighted readiness.")
    parser.add_argument("--profiles-path", type=Path, default=DEFAULT_PROFILES_PATH)
    parser.add_argument("--checklist-path", type=Path, default=DEFAULT_CHECKLIST_PATH)
    parser.add_argument("--checklist-lane", default="interactive-brokers")
    args = parser.parse_args()

    profiles = load_profiles(args.profiles_path)
    profiles, checklist_gate = apply_operator_checklist_gate(
        profiles,
        checklist_path=args.checklist_path,
        lane_name=args.checklist_lane,
    )

    ranked = rank_lanes(profiles)
    selected = select_primary_lane(profiles)

    payload = {
        "weights": WEIGHTS,
        "required_gates": REQUIRED_GATES,
        "operator_checklist_gate": checklist_gate,
        "ranked_lanes": [
            {
                "name": lane.name,
                "status": lane.status,
                "weighted_score": lane.weighted_score,
                "eligible": lane.eligible,
                "missing_gates": lane.missing_gates,
            }
            for lane in ranked
        ],
        "selected_lane": {
            "name": selected.name,
            "weighted_score": selected.weighted_score,
            "status": selected.status,
        }
        if selected
        else None,
    }

    print(json.dumps(payload, default=_json_default, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
