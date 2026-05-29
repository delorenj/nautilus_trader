#!/usr/bin/env python3
# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------
"""Pre-trade governance gates for options paper/live readiness checks."""

from __future__ import annotations

from dataclasses import asdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class GovernanceInput:
    account_type: str = "margin"
    account_equity_usd: Decimal = Decimal("30000")
    round_trips_5d: int = 0
    options_approval_level: int = 2
    expected_edge_bps: Decimal = Decimal("35")
    premium_per_contract_usd: Decimal = Decimal("2.00")
    contracts: int = 1
    fee_per_contract_usd: Decimal = Decimal("0.65")
    weekly_risk_limit_usd: Decimal = Decimal("150")
    projected_weekly_risk_usd: Decimal = Decimal("25")
    min_net_edge_bps: Decimal = Decimal("15")
    max_contracts: int = 2


@dataclass(frozen=True)
class GovernanceCheck:
    check_id: str
    status: str
    passed: bool
    blocking: bool
    detail: str


@dataclass(frozen=True)
class GovernanceSnapshot:
    blocked: bool
    checks: list[GovernanceCheck]
    estimated_round_trip_fees_usd: Decimal
    estimated_fee_drag_bps: Decimal
    net_edge_bps_after_fees: Decimal

    def to_dict(self) -> dict[str, Any]:
        return {
            "blocked": self.blocked,
            "checks": [asdict(check) for check in self.checks],
            "estimated_round_trip_fees_usd": float(self.estimated_round_trip_fees_usd),
            "estimated_fee_drag_bps": float(self.estimated_fee_drag_bps),
            "net_edge_bps_after_fees": float(self.net_edge_bps_after_fees),
        }


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _q1(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.1"))


def _estimate_fee_drag_bps(
    *,
    premium_per_contract_usd: Decimal,
    contracts: int,
    fee_per_contract_usd: Decimal,
) -> tuple[Decimal, Decimal]:
    if contracts <= 0:
        return Decimal("0"), Decimal("0")

    round_trip_fees = _q2(Decimal(contracts) * fee_per_contract_usd * Decimal("2"))
    premium_notional = max(premium_per_contract_usd * Decimal(contracts) * Decimal("100"), Decimal("0.01"))
    drag_bps = _q1((round_trip_fees / premium_notional) * Decimal("10000"))
    return round_trip_fees, drag_bps


def evaluate_governance(gov: GovernanceInput) -> GovernanceSnapshot:
    checks: list[GovernanceCheck] = []

    account_type = gov.account_type.strip().lower()

    # 1) Options permission gate
    if gov.options_approval_level >= 2:
        checks.append(
            GovernanceCheck(
                check_id="options_approval",
                status="pass",
                passed=True,
                blocking=True,
                detail=f"Options approval level {gov.options_approval_level} supports long calls/puts.",
            ),
        )
    else:
        checks.append(
            GovernanceCheck(
                check_id="options_approval",
                status="fail",
                passed=False,
                blocking=True,
                detail=(
                    f"Options approval level {gov.options_approval_level} is below minimum 2 "
                    "for this strategy."
                ),
            ),
        )

    # 2) PDT gate
    if account_type == "margin":
        if gov.account_equity_usd < Decimal("25000") and gov.round_trips_5d >= 4:
            checks.append(
                GovernanceCheck(
                    check_id="pdt_window",
                    status="fail",
                    passed=False,
                    blocking=True,
                    detail=(
                        "Projected pattern day trading breach: margin equity below $25k with "
                        f"{gov.round_trips_5d} round trips in 5d."
                    ),
                ),
            )
        elif gov.account_equity_usd < Decimal("25000") and gov.round_trips_5d == 3:
            checks.append(
                GovernanceCheck(
                    check_id="pdt_window",
                    status="warn",
                    passed=True,
                    blocking=False,
                    detail="At 3/5 round trips under $25k margin equity; next day trade may trigger PDT.",
                ),
            )
        else:
            checks.append(
                GovernanceCheck(
                    check_id="pdt_window",
                    status="pass",
                    passed=True,
                    blocking=True,
                    detail="PDT exposure within guardrails for margin account.",
                ),
            )
    elif account_type == "cash":
        checks.append(
            GovernanceCheck(
                check_id="pdt_window",
                status="pass",
                passed=True,
                blocking=True,
                detail="Cash account path: PDT rule does not apply.",
            ),
        )
        checks.append(
            GovernanceCheck(
                check_id="cash_settlement",
                status="warn",
                passed=True,
                blocking=False,
                detail="Ensure settled funds discipline to avoid freeriding violations.",
            ),
        )
    else:
        checks.append(
            GovernanceCheck(
                check_id="account_type",
                status="fail",
                passed=False,
                blocking=True,
                detail=f"Unsupported account_type='{gov.account_type}'. Expected 'margin' or 'cash'.",
            ),
        )

    # 3) Weekly risk limit gate
    if gov.projected_weekly_risk_usd <= gov.weekly_risk_limit_usd:
        checks.append(
            GovernanceCheck(
                check_id="weekly_risk_budget",
                status="pass",
                passed=True,
                blocking=True,
                detail=(
                    f"Projected weekly risk ${_q2(gov.projected_weekly_risk_usd)} is within "
                    f"limit ${_q2(gov.weekly_risk_limit_usd)}."
                ),
            ),
        )
    else:
        checks.append(
            GovernanceCheck(
                check_id="weekly_risk_budget",
                status="fail",
                passed=False,
                blocking=True,
                detail=(
                    f"Projected weekly risk ${_q2(gov.projected_weekly_risk_usd)} exceeds "
                    f"limit ${_q2(gov.weekly_risk_limit_usd)}."
                ),
            ),
        )

    # 4) Micro-size gate
    if 1 <= gov.contracts <= gov.max_contracts:
        checks.append(
            GovernanceCheck(
                check_id="position_size",
                status="pass",
                passed=True,
                blocking=True,
                detail=f"Contracts={gov.contracts} within max_contracts={gov.max_contracts}.",
            ),
        )
    else:
        checks.append(
            GovernanceCheck(
                check_id="position_size",
                status="fail",
                passed=False,
                blocking=True,
                detail=(
                    f"Contracts={gov.contracts} violates micro-size gate (1..{gov.max_contracts})."
                ),
            ),
        )

    # 5) Fee drag gate
    fees_usd, fee_drag_bps = _estimate_fee_drag_bps(
        premium_per_contract_usd=gov.premium_per_contract_usd,
        contracts=gov.contracts,
        fee_per_contract_usd=gov.fee_per_contract_usd,
    )
    net_edge_bps = _q1(gov.expected_edge_bps - fee_drag_bps)
    if net_edge_bps >= gov.min_net_edge_bps:
        checks.append(
            GovernanceCheck(
                check_id="fee_adjusted_edge",
                status="pass",
                passed=True,
                blocking=True,
                detail=(
                    f"Net edge {net_edge_bps} bps after est. fees {fee_drag_bps} bps "
                    f"(min required {gov.min_net_edge_bps} bps)."
                ),
            ),
        )
    else:
        checks.append(
            GovernanceCheck(
                check_id="fee_adjusted_edge",
                status="fail",
                passed=False,
                blocking=True,
                detail=(
                    f"Net edge {net_edge_bps} bps after est. fees {fee_drag_bps} bps is below "
                    f"minimum {gov.min_net_edge_bps} bps."
                ),
            ),
        )

    blocked = any(check.blocking and not check.passed for check in checks)
    return GovernanceSnapshot(
        blocked=blocked,
        checks=checks,
        estimated_round_trip_fees_usd=fees_usd,
        estimated_fee_drag_bps=fee_drag_bps,
        net_edge_bps_after_fees=net_edge_bps,
    )
