# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------

from decimal import Decimal

from examples.live.options.options_governance import GovernanceInput
from examples.live.options.options_governance import evaluate_governance


def _check(snapshot, check_id: str):
    return next(item for item in snapshot.checks if item.check_id == check_id)


def test_evaluate_governance_passes_baseline_margin_profile() -> None:
    snapshot = evaluate_governance(
        GovernanceInput(
            account_type="margin",
            account_equity_usd=Decimal("30000"),
            round_trips_5d=1,
            options_approval_level=2,
            expected_edge_bps=Decimal("42"),
            premium_per_contract_usd=Decimal("8.00"),
            contracts=1,
            fee_per_contract_usd=Decimal("0.65"),
            weekly_risk_limit_usd=Decimal("150"),
            projected_weekly_risk_usd=Decimal("25"),
            min_net_edge_bps=Decimal("15"),
            max_contracts=2,
        ),
    )

    assert snapshot.blocked is False
    assert _check(snapshot, "options_approval").status == "pass"
    assert _check(snapshot, "pdt_window").status == "pass"
    assert _check(snapshot, "weekly_risk_budget").status == "pass"
    assert _check(snapshot, "position_size").status == "pass"
    assert _check(snapshot, "fee_adjusted_edge").status == "pass"


def test_evaluate_governance_blocks_low_approval_and_pdt_breach() -> None:
    snapshot = evaluate_governance(
        GovernanceInput(
            account_type="margin",
            account_equity_usd=Decimal("12000"),
            round_trips_5d=4,
            options_approval_level=1,
            expected_edge_bps=Decimal("45"),
            premium_per_contract_usd=Decimal("3.00"),
            contracts=1,
            fee_per_contract_usd=Decimal("0.65"),
            weekly_risk_limit_usd=Decimal("150"),
            projected_weekly_risk_usd=Decimal("25"),
            min_net_edge_bps=Decimal("15"),
            max_contracts=2,
        ),
    )

    assert snapshot.blocked is True
    assert _check(snapshot, "options_approval").status == "fail"
    assert _check(snapshot, "pdt_window").status == "fail"


def test_evaluate_governance_blocks_when_fees_destroy_edge() -> None:
    snapshot = evaluate_governance(
        GovernanceInput(
            account_type="margin",
            account_equity_usd=Decimal("30000"),
            round_trips_5d=0,
            options_approval_level=2,
            expected_edge_bps=Decimal("20"),
            premium_per_contract_usd=Decimal("0.40"),
            contracts=2,
            fee_per_contract_usd=Decimal("1.25"),
            weekly_risk_limit_usd=Decimal("150"),
            projected_weekly_risk_usd=Decimal("25"),
            min_net_edge_bps=Decimal("15"),
            max_contracts=2,
        ),
    )

    fee_gate = _check(snapshot, "fee_adjusted_edge")
    assert snapshot.blocked is True
    assert fee_gate.status == "fail"
    assert snapshot.net_edge_bps_after_fees < Decimal("15")
