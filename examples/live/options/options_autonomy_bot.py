#!/usr/bin/env python3
# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
# -------------------------------------------------------------------------------------------------
"""
Options autonomy cycle runner (paper-only).

Five-phase loop:
1) strategize_scan  - scan option contracts and rank by Black-Scholes edge
2) signal_watch     - enforce liquidity/risk gates
3) monitor_exit     - simulate paper entry/exit path
4) postmortem       - summarize outcome
5) learn            - write lesson for next cycle

This module never submits live orders.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from dataclasses import dataclass
from decimal import Decimal
from math import erf
from math import exp
from math import log
from math import sqrt
from pathlib import Path
from typing import Any

try:
    from examples.live.options.options_governance import GovernanceInput
    from examples.live.options.options_governance import evaluate_governance
except ModuleNotFoundError:  # direct script execution path
    from options_governance import GovernanceInput
    from options_governance import evaluate_governance

DEFAULT_VAR_DIR = Path("var/options_autonomy")
SCENARIOS = ("target", "stop", "timebox", "no-entry", "reject")


@dataclass(frozen=True)
class OptionQuote:
    contract_id: str
    symbol: str
    option_kind: str
    strike: Decimal
    expiry_days: int
    spot: Decimal
    bid: Decimal
    ask: Decimal
    mark_iv: Decimal
    risk_free_rate: Decimal


@dataclass(frozen=True)
class StrategyHypothesis:
    id: str
    rank: int
    domain: str
    symbol: str
    contract_id: str
    title: str
    thesis: str
    entry_rule: str
    exit_rule: str
    constraint_vector: str
    risk_budget_usd: Decimal
    confidence: Decimal
    edge_bps: Decimal
    spread_bps: Decimal
    ask_price: Decimal
    theoretical_price: Decimal
    suggested_contracts: int
    max_contracts: int
    status: str = "candidate"


@dataclass(frozen=True)
class SignalObservation:
    signal_id: str
    strategy_id: str
    symbol: str
    instrument_id: str
    side: str
    created_ts: int
    reference_price: Decimal
    confidence: Decimal
    passed: bool
    reason: str
    spread_bps: Decimal
    edge_bps: Decimal
    suggested_notional: Decimal
    contracts: int
    governance: dict[str, Any] | None = None


@dataclass(frozen=True)
class PaperPosition:
    signal_id: str
    strategy_id: str
    instrument_id: str
    market_title: str
    outcome: str
    symbol: str
    side: str
    entry_price: Decimal
    exit_price: Decimal | None
    current_price: Decimal
    target_price: Decimal
    stop_price: Decimal
    contracts: int
    notional_usd: Decimal
    opened_ts: int
    closed_ts: int | None
    pnl_usd: Decimal
    close_reason: str | None
    status: str


@dataclass(frozen=True)
class Postmortem:
    cycle_id: str
    created_ts: int
    result: str
    close_reason: str
    strategy_id: str
    side: str
    outcome: str
    market_title: str
    entry_price: Decimal | None
    exit_price: Decimal | None
    pnl_usd: Decimal
    findings: list[str]
    next_adjustment: str


@dataclass(frozen=True)
class Lesson:
    lesson_id: str
    cycle_id: str
    created_ts: int
    market_title: str
    side: str
    outcome: str
    action: str
    recommendation: str


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Unsupported JSON value: {value!r}")


def _append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(row, default=_json_default, sort_keys=True))
        file.write("\n")


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _safe_id(value: str) -> str:
    return value.replace("/", "").replace("-", "").replace(" ", "").lower()


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


def black_scholes_price(
    *,
    spot: Decimal,
    strike: Decimal,
    time_years: Decimal,
    risk_free_rate: Decimal,
    volatility: Decimal,
    option_kind: str,
) -> Decimal:
    """Return Black-Scholes theoretical premium."""
    s = float(spot)
    k = float(strike)
    t = max(float(time_years), 0.0)
    r = float(risk_free_rate)
    sigma = max(float(volatility), 0.0)

    if t <= 0.0 or sigma <= 0.0:
        intrinsic = max(0.0, s - k) if option_kind == "call" else max(0.0, k - s)
        return _quantize_money(Decimal(str(intrinsic)))

    d1 = (log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrt(t))
    d2 = d1 - sigma * sqrt(t)

    if option_kind == "call":
        price = s * _normal_cdf(d1) - k * exp(-r * t) * _normal_cdf(d2)
    else:
        price = k * exp(-r * t) * _normal_cdf(-d2) - s * _normal_cdf(-d1)

    return _quantize_money(Decimal(str(max(price, 0.0))))


def simulated_option_chain(symbol: str, now: int, scenario: str) -> list[OptionQuote]:
    """Deterministic synthetic chain for repeatable tests and paper rehearsals."""
    if scenario not in SCENARIOS:
        raise ValueError(f"Unsupported scenario: {scenario}")

    spot = Decimal("500.00")
    expiry_days = 7
    rfr = Decimal("0.04")
    iv = Decimal("0.24")

    strikes = [Decimal("480"), Decimal("490"), Decimal("500"), Decimal("510"), Decimal("520")]
    option_kinds = ["call", "call", "call", "put", "put"]

    quotes: list[OptionQuote] = []
    for strike, kind in zip(strikes, option_kinds):
        theo = black_scholes_price(
            spot=spot,
            strike=strike,
            time_years=Decimal(expiry_days) / Decimal(365),
            risk_free_rate=rfr,
            volatility=iv,
            option_kind=kind,
        )

        if scenario == "target":
            ask = _quantize_money(theo * Decimal("0.90"))
            bid = _quantize_money(ask * Decimal("0.97"))
        elif scenario == "stop":
            ask = _quantize_money(theo * Decimal("0.98"))
            bid = _quantize_money(ask * Decimal("0.94"))
        elif scenario == "timebox":
            ask = _quantize_money(theo * Decimal("0.95"))
            bid = _quantize_money(ask * Decimal("0.95"))
        elif scenario == "reject":
            ask = _quantize_money(theo * Decimal("0.90"))
            bid = _quantize_money(ask * Decimal("0.97"))
        else:  # no-entry
            ask = _quantize_money(theo * Decimal("1.18"))
            bid = _quantize_money(ask * Decimal("0.82"))

        contract_id = f"{symbol}-{expiry_days}D-{int(strike)}-{kind[0].upper()}"
        quotes.append(
            OptionQuote(
                contract_id=contract_id,
                symbol=symbol,
                option_kind=kind,
                strike=strike,
                expiry_days=expiry_days,
                spot=spot,
                bid=max(bid, Decimal("0.01")),
                ask=max(ask, Decimal("0.02")),
                mark_iv=iv,
                risk_free_rate=rfr,
            ),
        )

    return quotes


def _spread_bps(bid: Decimal, ask: Decimal) -> Decimal:
    mid = (bid + ask) / Decimal(2)
    if mid <= 0:
        return Decimal("99999")
    return ((ask - bid) / mid * Decimal(10000)).quantize(Decimal("0.01"))


def _edge_bps(theoretical: Decimal, ask: Decimal) -> Decimal:
    if ask <= 0:
        return Decimal("-99999")
    return (((theoretical - ask) / ask) * Decimal(10000)).quantize(Decimal("0.01"))


def generate_strategy_slate(
    *,
    symbols: list[str],
    lessons: list[dict[str, Any]],
    risk_budget_usd: Decimal,
    scenario: str,
    now: int = 1_800_000_000,
) -> list[StrategyHypothesis]:
    symbol = symbols[0]
    quotes = simulated_option_chain(symbol, now, scenario)

    scored: list[tuple[Decimal, OptionQuote, Decimal, Decimal, int]] = []
    for quote in quotes:
        theoretical = black_scholes_price(
            spot=quote.spot,
            strike=quote.strike,
            time_years=Decimal(quote.expiry_days) / Decimal(365),
            risk_free_rate=quote.risk_free_rate,
            volatility=quote.mark_iv,
            option_kind=quote.option_kind,
        )
        spread_bps = _spread_bps(quote.bid, quote.ask)
        edge_bps = _edge_bps(theoretical, quote.ask)

        per_contract_cost = quote.ask * Decimal(100)
        max_contracts = max(int(risk_budget_usd // per_contract_cost), 1)
        suggested_contracts = min(max_contracts, 2)

        score = edge_bps - (spread_bps * Decimal("0.25"))
        # Slight lesson nudge for continuity
        if lessons:
            score += Decimal("5")

        scored.append((score, quote, theoretical, edge_bps, suggested_contracts))

    scored.sort(key=lambda item: item[0], reverse=True)

    hypotheses: list[StrategyHypothesis] = []
    for idx, (_, quote, theoretical, edge_bps, suggested_contracts) in enumerate(scored[:5], start=1):
        spread_bps = _spread_bps(quote.bid, quote.ask)
        confidence = Decimal("0.74") if idx == 1 else Decimal("0.61")
        hypotheses.append(
            StrategyHypothesis(
                id=f"{_safe_id(quote.contract_id)}-edge-{idx}",
                rank=idx,
                domain="options",
                symbol=quote.symbol,
                contract_id=quote.contract_id,
                title=f"{quote.symbol} {quote.option_kind.upper()} {quote.strike} micro-scalp",
                thesis="Exploit small theoretical mispricing while staying within strict spread and notional limits.",
                entry_rule="Edge >= 25 bps, spread <= 1200 bps, max 2 contracts.",
                exit_rule="Target/stop/timebox from scenario branch.",
                constraint_vector="micro-size + spread discipline + fixed weekly risk budget",
                risk_budget_usd=risk_budget_usd,
                confidence=confidence,
                edge_bps=edge_bps,
                spread_bps=spread_bps,
                ask_price=quote.ask,
                theoretical_price=theoretical,
                suggested_contracts=suggested_contracts,
                max_contracts=max(suggested_contracts, 1),
                status="selected" if idx == 1 else "candidate",
            ),
        )

    return hypotheses


def evaluate_signal(
    strategy: StrategyHypothesis,
    cycle_id: str,
    now: int,
    governance: dict[str, Any] | None = None,
) -> SignalObservation:
    market_gates_passed = (
        strategy.edge_bps >= Decimal("25")
        and strategy.spread_bps <= Decimal("1200")
        and strategy.suggested_contracts >= 1
    )
    governance_blocked = bool(governance and governance.get("blocked"))
    passed = market_gates_passed and not governance_blocked

    if governance_blocked:
        reason = "No entry: governance gate blocked strategy (approval/PDT/fees/risk)."
    elif passed:
        reason = "Signal accepted: theoretical edge and spread discipline passed."
    else:
        reason = "No entry: edge/spread gates failed for controlled micro-risk execution."

    suggested_notional = _quantize_money(strategy.ask_price * Decimal(strategy.suggested_contracts) * Decimal(100))

    return SignalObservation(
        signal_id=f"signal-{cycle_id}",
        strategy_id=strategy.id,
        symbol=strategy.symbol,
        instrument_id=f"{strategy.contract_id}.SIMOPT",
        side="BUY",
        created_ts=now,
        reference_price=strategy.ask_price,
        confidence=strategy.confidence,
        passed=passed,
        reason=reason,
        spread_bps=strategy.spread_bps,
        edge_bps=strategy.edge_bps,
        suggested_notional=suggested_notional,
        contracts=strategy.suggested_contracts,
        governance=governance,
    )


def _simulate_position(
    *,
    signal: SignalObservation,
    scenario: str,
    now: int,
) -> PaperPosition:
    entry = signal.reference_price

    if scenario == "target":
        exit_price = _quantize_money(entry * Decimal("1.25"))
        close_reason = "target"
    elif scenario == "stop":
        exit_price = _quantize_money(entry * Decimal("0.60"))
        close_reason = "stop"
    elif scenario == "timebox":
        exit_price = _quantize_money(entry * Decimal("1.02"))
        close_reason = "timebox"
    else:
        exit_price = None
        close_reason = None

    target_price = _quantize_money(entry * Decimal("1.25"))
    stop_price = _quantize_money(entry * Decimal("0.60"))

    if exit_price is None:
        pnl = Decimal("0")
        status = "OPEN"
        closed_ts = None
        current = entry
    else:
        contract_multiplier = Decimal("100")
        pnl = _quantize_money((exit_price - entry) * Decimal(signal.contracts) * contract_multiplier)
        status = "CLOSED"
        closed_ts = now + 60
        current = exit_price

    notional = _quantize_money(entry * Decimal(signal.contracts) * Decimal(100))

    return PaperPosition(
        signal_id=signal.signal_id,
        strategy_id=signal.strategy_id,
        instrument_id=signal.instrument_id,
        market_title=f"{signal.symbol} option micro-scalp",
        outcome=f"{signal.symbol} options {scenario} branch",
        symbol=signal.symbol,
        side=signal.side,
        entry_price=entry,
        exit_price=exit_price,
        current_price=current,
        target_price=target_price,
        stop_price=stop_price,
        contracts=signal.contracts,
        notional_usd=notional,
        opened_ts=now,
        closed_ts=closed_ts,
        pnl_usd=pnl,
        close_reason=close_reason,
        status=status,
    )


def _postmortem_from_position(cycle_id: str, position: PaperPosition, now: int) -> Postmortem:
    if position.close_reason == "target":
        result = "win"
        next_adjustment = "Keep contract scan thresholds unchanged."
        findings = ["Target branch validated micro-contract edge execution."]
    elif position.close_reason == "stop":
        result = "loss"
        next_adjustment = "Reduce contract count after adverse move."
        findings = ["Stop branch protected downside at predefined threshold."]
    elif position.close_reason == "timebox":
        result = "timebox"
        next_adjustment = "Tighten stale-exposure limits for slow contracts."
        findings = ["Timebox branch exited low-velocity contract as designed."]
    else:
        result = "open"
        next_adjustment = "No close yet; keep monitoring state machine."
        findings = ["Position remained open."]

    return Postmortem(
        cycle_id=cycle_id,
        created_ts=now,
        result=result,
        close_reason=position.close_reason or "none",
        strategy_id=position.strategy_id,
        side=position.side,
        outcome=position.outcome,
        market_title=position.market_title,
        entry_price=position.entry_price,
        exit_price=position.exit_price,
        pnl_usd=position.pnl_usd,
        findings=findings,
        next_adjustment=next_adjustment,
    )


def _postmortem_for_no_entry(cycle_id: str, strategy_id: str, symbol: str, now: int) -> Postmortem:
    return Postmortem(
        cycle_id=cycle_id,
        created_ts=now,
        result="no_entry",
        close_reason="no_signal",
        strategy_id=strategy_id,
        side="BUY",
        outcome=f"{symbol} no-entry branch",
        market_title=f"{symbol} option signal watch",
        entry_price=None,
        exit_price=None,
        pnl_usd=Decimal("0"),
        findings=["No-entry branch preserved capital due to edge/spread gate failure."],
        next_adjustment="Loosen one scan constraint only after additional evidence.",
    )


def _postmortem_for_rejected_entry(cycle_id: str, strategy_id: str, symbol: str, now: int) -> Postmortem:
    return Postmortem(
        cycle_id=cycle_id,
        created_ts=now,
        result="rejected",
        close_reason="order_rejected",
        strategy_id=strategy_id,
        side="BUY",
        outcome=f"{symbol} order rejected branch",
        market_title=f"{symbol} option execution rejection",
        entry_price=None,
        exit_price=None,
        pnl_usd=Decimal("0"),
        findings=["Execution venue rejected the order in paper simulation path."],
        next_adjustment="Review order routing constraints and limit offsets before retry.",
    )


def _lesson_from_postmortem(postmortem: Postmortem, now: int) -> Lesson:
    if postmortem.result == "win":
        action = "reinforce_micro_edge_setup"
        recommendation = "Repeat the same edge profile with identical risk budget."
    elif postmortem.result == "loss":
        action = "cooldown_contract_after_loss"
        recommendation = "Cooldown this contract family and reduce exposure."
    elif postmortem.result == "timebox":
        action = "tighten_stale_exposure_timebox"
        recommendation = "Avoid slow contracts with weak follow-through."
    elif postmortem.result == "rejected":
        action = "review_execution_constraints_after_rejection"
        recommendation = "Adjust routing/limit assumptions before next rehearsal."
    else:
        action = "relax_one_entry_constraint"
        recommendation = "Loosen one constraint only for next paper rehearsal."

    return Lesson(
        lesson_id=f"lesson-{postmortem.cycle_id}",
        cycle_id=postmortem.cycle_id,
        created_ts=now,
        market_title=postmortem.market_title,
        side=postmortem.side,
        outcome=postmortem.outcome,
        action=action,
        recommendation=recommendation,
    )


def _write_runtime_state(
    *,
    var_dir: Path,
    cycle_id: str,
    cycle_number: int,
    phase: str,
    status_line: str,
    strategies: list[StrategyHypothesis],
    selected_strategy_id: str,
    signal: SignalObservation | None,
    position: PaperPosition | None,
    postmortem: Postmortem | None,
    lesson: Lesson | None,
    updated_ts: int,
) -> None:
    state = {
        "cycle_id": cycle_id,
        "cycle_number": cycle_number,
        "phase": phase,
        "status_line": status_line,
        "updated_ts": updated_ts,
        "selected_strategy_id": selected_strategy_id,
        "strategies": [asdict(strategy) for strategy in strategies],
        "signal": asdict(signal) if signal else None,
        "position": asdict(position) if position else None,
        "postmortem": asdict(postmortem) if postmortem else None,
        "lesson": asdict(lesson) if lesson else None,
    }

    path = var_dir / "runtime_state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, default=_json_default, indent=2, sort_keys=True), encoding="utf-8")


def _scenario_sequence(base_scenario: str, sequence: list[str] | None, cycle_count: int) -> list[str]:
    if sequence:
        items = [item.strip() for item in sequence if item.strip()]
    else:
        items = [base_scenario]

    if not items:
        items = [base_scenario]

    result = []
    for i in range(cycle_count):
        result.append(items[i % len(items)])
    return result


def run_cycle(
    *,
    var_dir: Path,
    symbols: list[str],
    risk_budget_usd: Decimal,
    scenario: str,
    source: str,
    now: int,
    cycle_number: int = 1,
    phase_delay_secs: Decimal = Decimal(0),
    account_type: str = "margin",
    account_equity_usd: Decimal = Decimal("30000"),
    round_trips_5d: int = 0,
    options_approval_level: int = 2,
    fee_per_contract_usd: Decimal = Decimal("0.65"),
    weekly_risk_limit_usd: Decimal = Decimal("150"),
    projected_weekly_risk_usd: Decimal | None = None,
    min_net_edge_bps: Decimal = Decimal("15"),
    max_contracts: int = 2,
) -> dict[str, Any]:
    if scenario not in SCENARIOS:
        raise ValueError(f"Unsupported scenario: {scenario}")

    cycle_id = f"options-cycle-{cycle_number:04d}"
    lessons_path = var_dir / "strategy_lessons.jsonl"
    prior_lessons: list[dict[str, Any]] = []
    if lessons_path.exists():
        prior_lessons = [json.loads(line) for line in lessons_path.read_text(encoding="utf-8").splitlines() if line.strip()]

    strategies = generate_strategy_slate(
        symbols=symbols,
        lessons=prior_lessons,
        risk_budget_usd=risk_budget_usd,
        scenario=scenario,
        now=now,
    )
    selected = strategies[0]

    governance_input = GovernanceInput(
        account_type=account_type,
        account_equity_usd=account_equity_usd,
        round_trips_5d=round_trips_5d,
        options_approval_level=options_approval_level,
        expected_edge_bps=selected.edge_bps,
        premium_per_contract_usd=selected.ask_price,
        contracts=selected.suggested_contracts,
        fee_per_contract_usd=fee_per_contract_usd,
        weekly_risk_limit_usd=weekly_risk_limit_usd,
        projected_weekly_risk_usd=(
            projected_weekly_risk_usd if projected_weekly_risk_usd is not None else risk_budget_usd
        ),
        min_net_edge_bps=min_net_edge_bps,
        max_contracts=max_contracts,
    )
    governance = evaluate_governance(governance_input).to_dict()

    _write_runtime_state(
        var_dir=var_dir,
        cycle_id=cycle_id,
        cycle_number=cycle_number,
        phase="strategize_scan",
        status_line=f"Ranked {len(strategies)} option contracts by theoretical edge.",
        strategies=strategies,
        selected_strategy_id=selected.id,
        signal=None,
        position=None,
        postmortem=None,
        lesson=None,
        updated_ts=now,
    )
    if phase_delay_secs > 0:
        time.sleep(float(phase_delay_secs))

    signal = evaluate_signal(selected, cycle_id, now + 1, governance=governance)
    _write_runtime_state(
        var_dir=var_dir,
        cycle_id=cycle_id,
        cycle_number=cycle_number,
        phase="signal_watch",
        status_line=signal.reason,
        strategies=strategies,
        selected_strategy_id=selected.id,
        signal=signal,
        position=None,
        postmortem=None,
        lesson=None,
        updated_ts=signal.created_ts,
    )
    if phase_delay_secs > 0:
        time.sleep(float(phase_delay_secs))

    position: PaperPosition | None
    postmortem: Postmortem

    if signal.passed and scenario != "reject":
        position = _simulate_position(signal=signal, scenario=scenario, now=now + 2)
        _write_runtime_state(
            var_dir=var_dir,
            cycle_id=cycle_id,
            cycle_number=cycle_number,
            phase="monitor_exit",
            status_line=f"Paper position {'closed' if position.status == 'CLOSED' else 'opened'} ({position.close_reason or 'open'}).",
            strategies=strategies,
            selected_strategy_id=selected.id,
            signal=signal,
            position=position,
            postmortem=None,
            lesson=None,
            updated_ts=now + 2,
        )
        postmortem = _postmortem_from_position(cycle_id, position, now + 3)
    elif signal.passed and scenario == "reject":
        position = None
        _write_runtime_state(
            var_dir=var_dir,
            cycle_id=cycle_id,
            cycle_number=cycle_number,
            phase="monitor_exit",
            status_line="Paper order rejected by execution venue simulation.",
            strategies=strategies,
            selected_strategy_id=selected.id,
            signal=signal,
            position=None,
            postmortem=None,
            lesson=None,
            updated_ts=now + 2,
        )
        postmortem = _postmortem_for_rejected_entry(cycle_id, selected.id, selected.symbol, now + 3)
    else:
        position = None
        _write_runtime_state(
            var_dir=var_dir,
            cycle_id=cycle_id,
            cycle_number=cycle_number,
            phase="monitor_exit",
            status_line="No entry recorded due to signal gate failure.",
            strategies=strategies,
            selected_strategy_id=selected.id,
            signal=signal,
            position=None,
            postmortem=None,
            lesson=None,
            updated_ts=now + 2,
        )
        postmortem = _postmortem_for_no_entry(cycle_id, selected.id, selected.symbol, now + 3)

    if phase_delay_secs > 0:
        time.sleep(float(phase_delay_secs))

    _write_runtime_state(
        var_dir=var_dir,
        cycle_id=cycle_id,
        cycle_number=cycle_number,
        phase="postmortem",
        status_line=f"Postmortem result: {postmortem.result}.",
        strategies=strategies,
        selected_strategy_id=selected.id,
        signal=signal,
        position=position,
        postmortem=postmortem,
        lesson=None,
        updated_ts=postmortem.created_ts,
    )

    lesson = _lesson_from_postmortem(postmortem, now + 4)
    _write_runtime_state(
        var_dir=var_dir,
        cycle_id=cycle_id,
        cycle_number=cycle_number,
        phase="learn",
        status_line=f"Lesson action: {lesson.action}.",
        strategies=strategies,
        selected_strategy_id=selected.id,
        signal=signal,
        position=position,
        postmortem=postmortem,
        lesson=lesson,
        updated_ts=lesson.created_ts,
    )

    decision_row = {
        "cycle_id": cycle_id,
        "created_ts": now,
        "selected_strategy_id": selected.id,
        "selected_rank": selected.rank,
        "domain": selected.domain,
        "symbol": selected.symbol,
        "hypotheses_count": len(strategies),
        "lessons_considered_count": len(prior_lessons),
        "lessons_considered": [lesson_row.get("action", "") for lesson_row in prior_lessons[-3:]],
        "governance": governance,
        "selected_reason": (
            f"Picked {selected.contract_id} with edge {selected.edge_bps} bps and spread "
            f"{selected.spread_bps} bps under micro-risk constraints."
        ),
        "scoring": [
            {
                "strategy_id": hypothesis.id,
                "rank": hypothesis.rank,
                "title": hypothesis.title,
                "score": float(hypothesis.edge_bps - (hypothesis.spread_bps * Decimal("0.25"))),
                "confidence": float(hypothesis.confidence),
                "risk_budget_usd": float(hypothesis.risk_budget_usd),
                "constraint_vector": hypothesis.constraint_vector,
                "lesson_adjustment": "prior-lesson-nudge" if prior_lessons else "none",
                "rationale": "Higher edge with controlled spread and micro-size.",
                "vector_scores": [
                    {"id": "edge_capture", "label": "Edge capture", "score": float(hypothesis.edge_bps)},
                    {"id": "spread_discipline", "label": "Spread discipline", "score": float(Decimal("2000") - hypothesis.spread_bps)},
                    {"id": "micro_risk", "label": "Micro risk sizing", "score": float(100 - hypothesis.suggested_contracts * 10)},
                ],
            }
            for hypothesis in strategies
        ],
    }

    for hypothesis in strategies:
        _append_jsonl(var_dir / "strategy_hypotheses.jsonl", {"cycle_id": cycle_id, **asdict(hypothesis)})
    _append_jsonl(var_dir / "strategy_decisions.jsonl", decision_row)
    _append_jsonl(var_dir / "signal_observations.jsonl", asdict(signal))
    _append_jsonl(
        var_dir / "contract_cycles.jsonl",
        {
            "cycle_id": cycle_id,
            "created_ts": now,
            "status": (
                "CLOSED"
                if position and position.status == "CLOSED"
                else "REJECTED"
                if postmortem.result == "rejected"
                else "NO_ENTRY"
            ),
            "phase": "learn",
            "selected_strategy_id": selected.id,
            "signal_id": signal.signal_id,
            "position": asdict(position) if position else None,
            "no_entry_reason": None if position else signal.reason,
            "source": source,
            "scenario": scenario,
        },
    )
    _append_jsonl(var_dir / "contract_postmortems.jsonl", asdict(postmortem))
    _append_jsonl(var_dir / "strategy_lessons.jsonl", asdict(lesson))

    return {
        "cycle_id": cycle_id,
        "phase": "learn",
        "signal_passed": signal.passed,
        "position_status": (
            position.status
            if position
            else "REJECTED"
            if postmortem.result == "rejected"
            else "NO_ENTRY"
        ),
        "position_close_reason": (
            position.close_reason
            if position
            else "order_rejected"
            if postmortem.result == "rejected"
            else "no_signal"
        ),
        "pnl_usd": float(position.pnl_usd) if position else 0.0,
        "lesson_action": lesson.action,
        "scenario": scenario,
        "governance_blocked": bool(governance.get("blocked")),
        "governance_net_edge_bps": governance.get("net_edge_bps_after_fees"),
    }


def run_cycles(
    *,
    var_dir: Path,
    symbols: list[str],
    risk_budget_usd: Decimal,
    scenario: str,
    scenario_sequence: list[str] | None,
    source: str,
    cycle_count: int,
    now: int,
    phase_delay_secs: Decimal = Decimal(0),
    account_type: str = "margin",
    account_equity_usd: Decimal = Decimal("30000"),
    round_trips_5d: int = 0,
    options_approval_level: int = 2,
    fee_per_contract_usd: Decimal = Decimal("0.65"),
    weekly_risk_limit_usd: Decimal = Decimal("150"),
    projected_weekly_risk_usd: Decimal | None = None,
    min_net_edge_bps: Decimal = Decimal("15"),
    max_contracts: int = 2,
) -> dict[str, Any]:
    scenarios = _scenario_sequence(scenario, scenario_sequence, cycle_count)

    completed: list[dict[str, Any]] = []
    for i, scenario_item in enumerate(scenarios, start=1):
        completed.append(
            run_cycle(
                var_dir=var_dir,
                symbols=symbols,
                risk_budget_usd=risk_budget_usd,
                scenario=scenario_item,
                source=source,
                now=now + (i - 1) * 60,
                cycle_number=i,
                phase_delay_secs=phase_delay_secs,
                account_type=account_type,
                account_equity_usd=account_equity_usd,
                round_trips_5d=round_trips_5d,
                options_approval_level=options_approval_level,
                fee_per_contract_usd=fee_per_contract_usd,
                weekly_risk_limit_usd=weekly_risk_limit_usd,
                projected_weekly_risk_usd=projected_weekly_risk_usd,
                min_net_edge_bps=min_net_edge_bps,
                max_contracts=max_contracts,
            ),
        )

    pnl_total = _quantize_money(Decimal(str(sum(item["pnl_usd"] for item in completed))))
    wins = sum(1 for item in completed if item["position_close_reason"] == "target")
    losses = sum(1 for item in completed if item["position_close_reason"] == "stop")
    no_entries = sum(1 for item in completed if item["position_status"] == "NO_ENTRY")
    rejections = sum(1 for item in completed if item["position_status"] == "REJECTED")

    last_lesson = completed[-1]["lesson_action"]
    next_cycle_scenario = "no-entry" if last_lesson == "cooldown_contract_after_loss" else "target"
    next_cycle_recommendation = (
        "Cool down high-slippage contracts next cycle."
        if next_cycle_scenario == "no-entry"
        else "Rehearse clean target branch with identical micro-size."
    )

    summary = {
        "session_id": f"options-session-{now}",
        "cycle_count": cycle_count,
        "scenario_sequence": scenarios,
        "completed_cycles": completed,
        "aggregate_pnl_usd": float(pnl_total),
        "wins": wins,
        "losses": losses,
        "no_entries": no_entries,
        "rejections": rejections,
        "last_lesson_action": last_lesson,
        "next_cycle_scenario": next_cycle_scenario,
        "next_cycle_recommendation": next_cycle_recommendation,
    }

    runbook_path = var_dir / "session_runbook.json"
    runbook_path.parent.mkdir(parents=True, exist_ok=True)
    runbook_path.write_text(json.dumps(summary, default=_json_default, indent=2, sort_keys=True), encoding="utf-8")
    _append_jsonl(var_dir / "session_runbooks.jsonl", summary)

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run options autonomy paper experiment cycles.")
    parser.add_argument("--source", default="simulated", choices=("simulated",), help="Data source.")
    parser.add_argument("--scenario", default="target", choices=SCENARIOS)
    parser.add_argument("--scenario-sequence", default="", help="Comma-separated scenario sequence.")
    parser.add_argument("--cycle-count", type=int, default=1)
    parser.add_argument("--symbol", action="append", default=["SPY"], help="Underlying symbol(s).")
    parser.add_argument("--risk-budget-usd", type=Decimal, default=Decimal("25"))
    parser.add_argument("--account-type", default="margin", choices=("margin", "cash"))
    parser.add_argument("--account-equity-usd", type=Decimal, default=Decimal("30000"))
    parser.add_argument("--round-trips-5d", type=int, default=0)
    parser.add_argument("--options-approval-level", type=int, default=2)
    parser.add_argument("--fee-per-contract-usd", type=Decimal, default=Decimal("0.65"))
    parser.add_argument("--weekly-risk-limit-usd", type=Decimal, default=Decimal("150"))
    parser.add_argument("--projected-weekly-risk-usd", type=Decimal, default=None)
    parser.add_argument("--min-net-edge-bps", type=Decimal, default=Decimal("15"))
    parser.add_argument("--max-contracts", type=int, default=2)
    parser.add_argument("--phase-delay-secs", type=Decimal, default=Decimal("0"))
    parser.add_argument("--var-dir", type=Path, default=DEFAULT_VAR_DIR)
    parser.add_argument("--now", type=int, default=1_800_000_000)

    args = parser.parse_args()

    symbols = [symbol.upper() for symbol in args.symbol]
    scenario_sequence = [item.strip() for item in args.scenario_sequence.split(",") if item.strip()]

    if args.cycle_count <= 1:
        summary = run_cycle(
            var_dir=args.var_dir,
            symbols=symbols,
            risk_budget_usd=args.risk_budget_usd,
            scenario=args.scenario,
            source=args.source,
            now=args.now,
            cycle_number=1,
            phase_delay_secs=args.phase_delay_secs,
            account_type=args.account_type,
            account_equity_usd=args.account_equity_usd,
            round_trips_5d=args.round_trips_5d,
            options_approval_level=args.options_approval_level,
            fee_per_contract_usd=args.fee_per_contract_usd,
            weekly_risk_limit_usd=args.weekly_risk_limit_usd,
            projected_weekly_risk_usd=args.projected_weekly_risk_usd,
            min_net_edge_bps=args.min_net_edge_bps,
            max_contracts=args.max_contracts,
        )
    else:
        summary = run_cycles(
            var_dir=args.var_dir,
            symbols=symbols,
            risk_budget_usd=args.risk_budget_usd,
            scenario=args.scenario,
            scenario_sequence=scenario_sequence or None,
            source=args.source,
            cycle_count=args.cycle_count,
            now=args.now,
            phase_delay_secs=args.phase_delay_secs,
            account_type=args.account_type,
            account_equity_usd=args.account_equity_usd,
            round_trips_5d=args.round_trips_5d,
            options_approval_level=args.options_approval_level,
            fee_per_contract_usd=args.fee_per_contract_usd,
            weekly_risk_limit_usd=args.weekly_risk_limit_usd,
            projected_weekly_risk_usd=args.projected_weekly_risk_usd,
            min_net_edge_bps=args.min_net_edge_bps,
            max_contracts=args.max_contracts,
        )

    print(json.dumps(summary, default=_json_default, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
