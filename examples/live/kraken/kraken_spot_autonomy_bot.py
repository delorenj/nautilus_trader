#!/usr/bin/env python3
# -------------------------------------------------------------------------------------------------
#  Copyright (C) 2015-2026 Nautech Systems Pty Ltd. All rights reserved.
#  https://nautechsystems.io
#
#  Licensed under the GNU Lesser General Public License Version 3.0 (the "License");
#  You may not use this file except in compliance with the License.
#  You may obtain a copy of the License at https://www.gnu.org/licenses/lgpl-3.0.en.html
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
# -------------------------------------------------------------------------------------------------
"""
Kraken Spot autonomy cycle runner.

This is a concrete paper-trading runner for the five phase product loop:

1. Ideate a ranked strategy slate for Kraken Spot symbols.
2. Read price signals and either enter a paper position or record no-entry.
3. Monitor the open position against target, stop, and timebox.
4. Write a postmortem for the cycle.
5. Commit a reusable lesson for the next strategy slate.

It never submits live orders. It emits Nautilus/Kraken-shaped paper intents and
JSONL artifacts under ``var/kraken_spot_autonomy`` for the dashboard to hydrate.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen


DEFAULT_VAR_DIR = Path("var/kraken_spot_autonomy")
KRAKEN_VENUE = "KRAKEN"
SCENARIOS = ("target", "stop", "timebox", "no-entry")


@dataclass(frozen=True)
class StrategyHypothesis:
    id: str
    rank: int
    domain: str
    symbol: str
    title: str
    thesis: str
    entry_rule: str
    exit_rule: str
    constraint_vector: str
    risk_budget_usd: Decimal
    confidence: Decimal
    status: str = "candidate"


@dataclass(frozen=True)
class StrategyDecisionVector:
    id: str
    label: str
    score: Decimal
    rationale: str


@dataclass(frozen=True)
class StrategyDecisionScore:
    strategy_id: str
    rank: int
    title: str
    score: Decimal
    confidence: Decimal
    risk_budget_usd: Decimal
    constraint_vector: str
    lesson_adjustment: str
    rationale: str
    vector_scores: list[StrategyDecisionVector]


@dataclass(frozen=True)
class StrategyDecision:
    cycle_id: str
    created_ts: int
    selected_strategy_id: str
    selected_rank: int
    domain: str
    symbol: str
    hypotheses_count: int
    lessons_considered_count: int
    lessons_considered: list[str]
    lesson_influences: list[str]
    selected_reason: str
    scoring: list[StrategyDecisionScore]


@dataclass(frozen=True)
class PriceTick:
    symbol: str
    ts: int
    bid: Decimal
    ask: Decimal
    last: Decimal


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
    momentum_bps: Decimal
    suggested_notional: Decimal


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
    size_usdc: Decimal
    opened_ts: int
    closed_ts: int | None
    pnl_usdc: Decimal
    close_reason: str | None
    status: str


@dataclass(frozen=True)
class CycleResult:
    cycle_id: str
    created_ts: int
    status: str
    phase: str
    selected_strategy_id: str
    signal_id: str | None
    position: PaperPosition | None
    no_entry_reason: str | None


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
    pnl_usdc: Decimal
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


@dataclass(frozen=True)
class SessionCycleTrace:
    cycle_id: str
    scenario: str
    result: str
    close_reason: str
    pnl_usdc: Decimal
    lesson_action: str
    next_adjustment: str


@dataclass(frozen=True)
class SessionRunbook:
    session_id: str
    started_ts: int
    completed_ts: int
    status: str
    cycle_count: int
    scenario_sequence: list[str]
    cycle_ids: list[str]
    aggregate_pnl_usdc: Decimal
    wins: int
    losses: int
    no_entries: int
    latest_lesson_action: str
    next_cycle_scenario: str
    next_cycle_recommendation: str
    operator_summary: str
    cycle_trace: list[SessionCycleTrace]


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Unsupported JSON value: {value!r}")


def _instrument_id(symbol: str) -> str:
    return f"{symbol}.{KRAKEN_VENUE}"


def _safe_symbol_id(symbol: str) -> str:
    return symbol.replace("/", "").replace("-", "").lower()


def _kraken_pair(symbol: str) -> str:
    base, quote = symbol.upper().split("/", 1)
    if base == "BTC":
        base = "XBT"
    return f"{base}{quote}"


def _quantize_usd(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _quantize_price(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(row, default=_json_default, sort_keys=True))
        file.write("\n")


def _write_json(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(row, default=_json_default, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []

    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            rows.append(parsed)
    return rows


def _next_cycle_number(var_dir: Path) -> int:
    rows = (
        _read_jsonl(var_dir / "contract_cycles.jsonl")
        + _read_jsonl(var_dir / "contract_postmortems.jsonl")
        + _read_jsonl(var_dir / "strategy_lessons.jsonl")
    )
    cycle_ids = {row.get("cycle_id") for row in rows if row.get("cycle_id")}
    return len(cycle_ids) + 1


def _latest_lessons(var_dir: Path, limit: int = 8) -> list[dict[str, Any]]:
    rows = _read_jsonl(var_dir / "strategy_lessons.jsonl")
    return sorted(rows, key=lambda row: row.get("created_ts", 0), reverse=True)[:limit]


def _lesson_influences(lessons: list[dict[str, Any]]) -> list[str]:
    if not lessons:
        return [
            "No prior lessons found; using the baseline Kraken Spot ranking and fixed paper size.",
        ]

    influences: list[str] = []
    seen_actions: set[str] = set()
    for lesson in lessons:
        action = str(lesson.get("action", "observe"))
        if action in seen_actions:
            continue
        seen_actions.add(action)

        if action == "reinforce_target_hit_setup":
            influences.append(
                "Target-hit lesson nudged the momentum setup higher without increasing size.",
            )
        elif action == "relax_one_entry_constraint":
            influences.append(
                "No-entry lesson keeps the spread gate intact and loosens only one impulse threshold.",
            )
        elif action == "cooldown_symbol_after_loss":
            influences.append(
                "Loss lesson cooled down same-symbol re-entry and requires stronger impulse.",
            )
        else:
            recommendation = str(lesson.get("recommendation", "")).strip()
            influences.append(
                recommendation
                or f"Lesson action {action.replace('_', ' ')} was considered for this slate.",
            )

    return influences


def _score(value: str) -> Decimal:
    return Decimal(value).quantize(Decimal("0.1"))


def _strategy_vector_scores(
    strategy: StrategyHypothesis,
    adjustments: list[str],
) -> list[StrategyDecisionVector]:
    entry = strategy.entry_rule.lower()
    exit_rule = strategy.exit_rule.lower()
    constraint = strategy.constraint_vector.lower()
    no_trade = strategy.risk_budget_usd == 0

    signal_quality = (strategy.confidence * Decimal(100)).quantize(Decimal("0.1"))
    spread_score = (
        _score("92")
        if no_trade
        else _score("84" if "spread" in entry else "68")
    )
    upside_score = _score(
        "45"
        if no_trade
        else "86"
        if "+55" in exit_rule or "+50" in exit_rule
        else "76",
    )
    downside_score = _score(
        "95"
        if no_trade
        else "86"
        if "hard stop" in constraint or "-30" in exit_rule
        else "78",
    )
    stale_score = _score(
        "90"
        if no_trade or "tick max hold" in exit_rule
        else "72",
    )
    lesson_base = Decimal("72.0")
    if "target-hit reinforcement" in adjustments:
        lesson_base += Decimal("10.0")
    if "single-threshold relaxation allowed" in adjustments:
        lesson_base += Decimal("6.0")
    if "same-symbol cooldown penalty" in adjustments:
        lesson_base -= Decimal("18.0")

    return [
        StrategyDecisionVector(
            id="signal_quality",
            label="Signal quality",
            score=signal_quality,
            rationale=f"Confidence is {strategy.confidence}.",
        ),
        StrategyDecisionVector(
            id="spread_discipline",
            label="Spread discipline",
            score=spread_score,
            rationale="Entry gate keeps spread bounded or preserves capital.",
        ),
        StrategyDecisionVector(
            id="upside_capture",
            label="Upside capture",
            score=upside_score,
            rationale=f"Exit rule: {strategy.exit_rule}.",
        ),
        StrategyDecisionVector(
            id="downside_protection",
            label="Downside protection",
            score=downside_score,
            rationale=f"Constraint vector: {strategy.constraint_vector}.",
        ),
        StrategyDecisionVector(
            id="stale_exposure",
            label="Stale exposure",
            score=stale_score,
            rationale="Timebox or no-entry rule limits idle exposure.",
        ),
        StrategyDecisionVector(
            id="lesson_fit",
            label="Lesson fit",
            score=lesson_base.quantize(Decimal("0.1")),
            rationale=", ".join(adjustments) if adjustments else "No direct lesson adjustment.",
        ),
    ]


def build_strategy_decision(
    *,
    cycle_id: str,
    created_ts: int,
    strategies: list[StrategyHypothesis],
    lessons: list[dict[str, Any]],
) -> StrategyDecision:
    if not strategies:
        raise ValueError("At least one strategy is required to build a decision record.")

    selected = next(
        (strategy for strategy in strategies if strategy.status == "selected"),
        strategies[0],
    )
    lesson_actions = {str(lesson.get("action", "")) for lesson in lessons}
    influences = _lesson_influences(lessons)
    lesson_summaries = [
        str(lesson.get("recommendation") or lesson.get("action") or "lesson considered")
        for lesson in lessons[:5]
    ]

    scoring: list[StrategyDecisionScore] = []
    for strategy in strategies:
        adjustments: list[str] = []
        if "reinforce_target_hit_setup" in lesson_actions and "momentum" in strategy.id:
            adjustments.append("target-hit reinforcement")
        if "relax_one_entry_constraint" in lesson_actions and strategy.rank == 1:
            adjustments.append("single-threshold relaxation allowed")
        if "cooldown_symbol_after_loss" in lesson_actions and strategy.rank == 1:
            adjustments.append("same-symbol cooldown penalty")

        lesson_adjustment = (
            ", ".join(adjustments)
            if adjustments
            else "baseline score; no direct lesson adjustment"
        )
        score = (strategy.confidence * Decimal(100)).quantize(Decimal("0.1"))
        vector_scores = _strategy_vector_scores(strategy, adjustments)
        rationale = (
            f"{strategy.constraint_vector}; confidence {strategy.confidence}; "
            f"risk cap {strategy.risk_budget_usd} USD."
        )
        scoring.append(
            StrategyDecisionScore(
                strategy_id=strategy.id,
                rank=strategy.rank,
                title=strategy.title,
                score=score,
                confidence=strategy.confidence,
                risk_budget_usd=strategy.risk_budget_usd,
                constraint_vector=strategy.constraint_vector,
                lesson_adjustment=lesson_adjustment,
                rationale=rationale,
                vector_scores=vector_scores,
            ),
        )

    first_influence = influences[0]
    selected_reason = (
        f"Picked {selected.title} because it is rank {selected.rank}, keeps a "
        f"{selected.risk_budget_usd} USD paper cap, and matches the active "
        f"constraint vector: {selected.constraint_vector}. {first_influence}"
    )

    return StrategyDecision(
        cycle_id=cycle_id,
        created_ts=created_ts,
        selected_strategy_id=selected.id,
        selected_rank=selected.rank,
        domain=selected.domain,
        symbol=selected.symbol,
        hypotheses_count=len(strategies),
        lessons_considered_count=len(lessons),
        lessons_considered=lesson_summaries,
        lesson_influences=influences,
        selected_reason=selected_reason,
        scoring=scoring,
    )


def generate_strategy_slate(
    *,
    symbols: list[str],
    lessons: list[dict[str, Any]],
    risk_budget_usd: Decimal,
) -> list[StrategyHypothesis]:
    primary_symbol = symbols[0]
    lesson_actions = {str(row.get("action", "")) for row in lessons}
    cooled_down = "cooldown_symbol_after_loss" in lesson_actions
    confidence_nudge = (
        Decimal("0.04") if "reinforce_target_hit_setup" in lesson_actions else Decimal(0)
    )

    slate = [
        StrategyHypothesis(
            id=f"{_safe_symbol_id(primary_symbol)}-momentum-continuation",
            rank=1,
            domain="crypto",
            symbol=primary_symbol,
            title=f"{primary_symbol} momentum continuation",
            thesis="Follow a clean short-horizon spot impulse only when spread and stop distance both stay tight.",
            entry_rule="Last price up at least 18 bps with spread <= 8 bps",
            exit_rule="+55 bps target, -30 bps stop, 4 tick max hold",
            constraint_vector="momentum with hard stop",
            risk_budget_usd=risk_budget_usd,
            confidence=(
                Decimal("0.68")
                + confidence_nudge
                - (Decimal("0.10") if cooled_down else Decimal(0))
            ),
            status="selected",
        ),
        StrategyHypothesis(
            id=f"{_safe_symbol_id(primary_symbol)}-mean-reversion",
            rank=2,
            domain="crypto",
            symbol=primary_symbol,
            title=f"{primary_symbol} spread mean reversion",
            thesis="Wait for a fast dip that keeps the book orderly, then paper-buy a small rebound.",
            entry_rule="Last price down at least 25 bps while spread <= 10 bps",
            exit_rule="+40 bps target, -25 bps stop, 3 tick max hold",
            constraint_vector="dip with orderly spread",
            risk_budget_usd=_quantize_usd(risk_budget_usd * Decimal("0.75")),
            confidence=Decimal("0.59"),
        ),
        StrategyHypothesis(
            id="eth-relative-strength",
            rank=3,
            domain="crypto",
            symbol=symbols[1] if len(symbols) > 1 else primary_symbol,
            title="ETH relative strength check",
            thesis="Only rotate into ETH when it confirms cleaner impulse than the primary BTC setup.",
            entry_rule="ETH impulse exceeds BTC impulse and spread <= 9 bps",
            exit_rule="+50 bps target, -30 bps stop",
            constraint_vector="cross-symbol confirmation",
            risk_budget_usd=_quantize_usd(risk_budget_usd * Decimal("0.65")),
            confidence=Decimal("0.55"),
        ),
        StrategyHypothesis(
            id="volatility-compression-break",
            rank=4,
            domain="crypto",
            symbol=primary_symbol,
            title="Volatility compression break",
            thesis="Do nothing until recent ticks compress, then buy the first expansion with a smaller size.",
            entry_rule="Two quiet ticks followed by +20 bps expansion",
            exit_rule="+35 bps target, -20 bps stop",
            constraint_vector="compressed volatility only",
            risk_budget_usd=_quantize_usd(risk_budget_usd * Decimal("0.50")),
            confidence=Decimal("0.51"),
        ),
        StrategyHypothesis(
            id="no-trade-quality-gate",
            rank=5,
            domain="crypto",
            symbol=primary_symbol,
            title="No-trade quality gate",
            thesis="Prefer recording no-entry over forcing a low-quality spot position.",
            entry_rule="Reject all setups if spread or impulse misses by more than one threshold",
            exit_rule="No position means no exit; write a constraint lesson",
            constraint_vector="capital preservation",
            risk_budget_usd=Decimal(0),
            confidence=Decimal("0.47"),
        ),
    ]
    return slate


def simulated_ticks(symbol: str, *, now: int, scenario: str) -> list[PriceTick]:
    if scenario == "no-entry":
        prices = [Decimal("100.00"), Decimal("100.03"), Decimal("100.04")]
    elif scenario == "stop":
        prices = [Decimal("100.00"), Decimal("100.24"), Decimal("99.70")]
    elif scenario == "timebox":
        prices = [Decimal("100.00"), Decimal("100.22"), Decimal("100.31"), Decimal("100.32")]
    else:
        prices = [Decimal("100.00"), Decimal("100.23"), Decimal("100.80")]

    return [
        PriceTick(
            symbol=symbol,
            ts=now + index,
            bid=_quantize_price(price * Decimal("0.9998")),
            ask=_quantize_price(price * Decimal("1.0002")),
            last=_quantize_price(price),
        )
        for index, price in enumerate(prices)
    ]


def fetch_kraken_public_ticks(symbol: str, *, now: int) -> list[PriceTick]:
    query = urlencode({"pair": _kraken_pair(symbol)})
    with urlopen(f"https://api.kraken.com/0/public/Ticker?{query}", timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if payload.get("error"):
        raise RuntimeError(f"Kraken public ticker failed: {payload['error']}")

    result = payload.get("result")
    if not isinstance(result, dict) or not result:
        raise RuntimeError("Kraken public ticker response did not include a result.")

    ticker = next(iter(result.values()))
    bid = Decimal(str(ticker["b"][0]))
    ask = Decimal(str(ticker["a"][0]))
    last = Decimal(str(ticker["c"][0]))
    previous = last * Decimal("0.998")

    return [
        PriceTick(symbol=symbol, ts=now - 1, bid=previous, ask=previous, last=previous),
        PriceTick(symbol=symbol, ts=now, bid=bid, ask=ask, last=last),
    ]


def evaluate_signal(
    strategy: StrategyHypothesis,
    ticks: list[PriceTick],
    *,
    cycle_id: str,
) -> SignalObservation:
    if len(ticks) < 2:
        raise ValueError("At least two ticks are required to evaluate a signal.")

    previous = ticks[0]
    latest = ticks[1]
    mid = (latest.bid + latest.ask) / Decimal(2)
    spread_bps = ((latest.ask - latest.bid) / mid) * Decimal(10000)
    momentum_bps = ((latest.last - previous.last) / previous.last) * Decimal(10000)
    passed = momentum_bps >= Decimal(18) and spread_bps <= Decimal(8)
    reason = (
        "Momentum and spread satisfied selected constraints."
        if passed
        else "No entry: impulse or spread did not clear the selected constraints."
    )

    return SignalObservation(
        signal_id=f"signal-{cycle_id}",
        strategy_id=strategy.id,
        symbol=strategy.symbol,
        instrument_id=_instrument_id(strategy.symbol),
        side="BUY",
        created_ts=latest.ts,
        reference_price=latest.last,
        confidence=Decimal("0.72") if passed else Decimal("0.38"),
        passed=passed,
        reason=reason,
        spread_bps=spread_bps.quantize(Decimal("0.01")),
        momentum_bps=momentum_bps.quantize(Decimal("0.01")),
        suggested_notional=strategy.risk_budget_usd,
    )


def monitor_position(
    strategy: StrategyHypothesis,
    signal: SignalObservation,
    ticks: list[PriceTick],
    *,
    opened_ts: int,
) -> PaperPosition:
    entry_price = signal.reference_price
    target_price = _quantize_price(entry_price * Decimal("1.0055"))
    stop_price = _quantize_price(entry_price * Decimal("0.9970"))
    exit_tick = ticks[-1]
    close_reason = "timebox"

    for tick in ticks[2:]:
        exit_tick = tick
        if tick.last >= target_price:
            close_reason = "target"
            break
        if tick.last <= stop_price:
            close_reason = "stop"
            break

    quantity = signal.suggested_notional / entry_price
    pnl = _quantize_usd((exit_tick.last - entry_price) * quantity)

    return PaperPosition(
        signal_id=signal.signal_id,
        strategy_id=strategy.id,
        instrument_id=signal.instrument_id,
        market_title=f"Kraken Spot {strategy.symbol} paper position",
        outcome=strategy.title,
        symbol=strategy.symbol,
        side="BUY",
        entry_price=_quantize_price(entry_price),
        exit_price=_quantize_price(exit_tick.last),
        current_price=_quantize_price(exit_tick.last),
        target_price=target_price,
        stop_price=stop_price,
        size_usdc=_quantize_usd(signal.suggested_notional),
        opened_ts=opened_ts,
        closed_ts=exit_tick.ts,
        pnl_usdc=pnl,
        close_reason=close_reason,
        status="CLOSED",
    )


def build_postmortem(cycle: CycleResult) -> Postmortem:
    if cycle.position is None:
        return Postmortem(
            cycle_id=cycle.cycle_id,
            created_ts=cycle.created_ts,
            result="no_entry",
            close_reason="no_signal",
            strategy_id=cycle.selected_strategy_id,
            side="BUY",
            outcome="No position opened",
            market_title="Kraken Spot signal watch",
            entry_price=None,
            exit_price=None,
            pnl_usdc=Decimal(0),
            findings=[
                cycle.no_entry_reason or "Signal constraints did not clear.",
                "Capital stayed out of the market for this cycle.",
            ],
            next_adjustment="Loosen exactly one entry threshold or wait for stronger impulse.",
        )

    position = cycle.position
    result = "win" if position.pnl_usdc > 0 else "loss" if position.pnl_usdc < 0 else "flat"
    return Postmortem(
        cycle_id=cycle.cycle_id,
        created_ts=position.closed_ts or cycle.created_ts,
        result=result,
        close_reason=position.close_reason or "unknown",
        strategy_id=position.strategy_id,
        side=position.side,
        outcome=position.outcome,
        market_title=position.market_title,
        entry_price=position.entry_price,
        exit_price=position.exit_price,
        pnl_usdc=position.pnl_usdc,
        findings=[
            f"Entered {position.symbol} at {position.entry_price} and exited at {position.exit_price}.",
            f"Exit reason was {position.close_reason}; paper PnL was {position.pnl_usdc} USDC.",
            "Risk budget stayed fixed; no live Kraken order was submitted.",
        ],
        next_adjustment=(
            "Keep the setup as positive evidence without increasing size automatically."
            if result == "win"
            else "Cool down this symbol after the failed paper cycle."
        ),
    )


def build_lesson(postmortem: Postmortem) -> Lesson:
    if postmortem.result == "win" and postmortem.close_reason == "target":
        action = "reinforce_target_hit_setup"
        recommendation = "Re-use the entry shape, but keep the same risk budget until it repeats."
    elif postmortem.result == "no_entry":
        action = "relax_one_entry_constraint"
        recommendation = "Loosen one constraint next cycle; do not loosen spread and momentum together."
    else:
        action = "cooldown_symbol_after_loss"
        recommendation = "Require stronger impulse before re-entering this symbol."

    return Lesson(
        lesson_id=f"lesson-{postmortem.cycle_id}",
        cycle_id=postmortem.cycle_id,
        created_ts=postmortem.created_ts + 1,
        market_title=postmortem.market_title,
        side=postmortem.side,
        outcome=postmortem.outcome,
        action=action,
        recommendation=recommendation,
    )


def learn_status_line(postmortem: Postmortem) -> str:
    if postmortem.result == "no_entry":
        return "No entry recorded; feedback asks the next cycle to loosen exactly one constraint."
    if postmortem.close_reason == "target":
        return "Target-hit postmortem written back as a reusable Kraken Spot strategy lesson."
    if postmortem.close_reason == "stop":
        return "Stop-loss postmortem written back as a cooldown lesson for the next cycle."
    if postmortem.close_reason == "timebox":
        return "Timebox postmortem written back so the next cycle can avoid stale exposure."

    return "Postmortem written back as a reusable Kraken Spot strategy lesson."


def next_scenario_for_lesson(action: str) -> str:
    if action == "relax_one_entry_constraint":
        return "target"
    if action == "cooldown_symbol_after_loss":
        return "no-entry"
    return "target"


def next_recommendation_for_lesson(action: str) -> str:
    if action == "reinforce_target_hit_setup":
        return "Run the same target-first setup again at the same paper risk before increasing size."
    if action == "relax_one_entry_constraint":
        return "Run the next cycle with exactly one looser entry threshold and keep spread discipline."
    if action == "cooldown_symbol_after_loss":
        return "Cool down same-symbol re-entry and require stronger momentum before another buy."
    return "Start the next cycle with the latest postmortem as the active constraint."


def write_session_runbook(*, var_dir: Path, runbook: SessionRunbook) -> None:
    row = {
        "event_type": "kraken_spot.session_runbook.v1",
        **asdict(runbook),
    }
    _append_jsonl(var_dir / "session_runbooks.jsonl", row)
    _write_json(var_dir / "session_runbook.json", row)


def write_cycle_artifacts(
    *,
    var_dir: Path,
    strategies: list[StrategyHypothesis],
    decision: StrategyDecision,
    signal: SignalObservation,
    cycle: CycleResult,
    postmortem: Postmortem,
    lesson: Lesson,
) -> None:
    for strategy in strategies:
        _append_jsonl(
            var_dir / "strategy_hypotheses.jsonl",
            {
                "event_type": "kraken_spot.strategy_hypothesis.v1",
                "created_ts": cycle.created_ts,
                **asdict(strategy),
            },
        )

    _append_jsonl(
        var_dir / "strategy_decisions.jsonl",
        {
            "event_type": "kraken_spot.strategy_decision.v1",
            **asdict(decision),
        },
    )
    _append_jsonl(
        var_dir / "signal_observations.jsonl",
        {
            "event_type": "kraken_spot.signal_observation.v1",
            **asdict(signal),
        },
    )
    _append_jsonl(
        var_dir / "contract_cycles.jsonl",
        {
            "event_type": "kraken_spot.trade_cycle.closed.v1",
            **asdict(cycle),
        },
    )
    _append_jsonl(
        var_dir / "contract_postmortems.jsonl",
        {
            "event_type": "kraken_spot.trade_cycle.postmortem.v1",
            **asdict(postmortem),
        },
    )
    _append_jsonl(
        var_dir / "strategy_lessons.jsonl",
        {
            "event_type": "kraken_spot.strategy_lesson.v1",
            **asdict(lesson),
        },
    )


def write_runtime_state(
    *,
    var_dir: Path,
    cycle_id: str,
    cycle_number: int,
    phase: str,
    status_line: str,
    strategies: list[StrategyHypothesis],
    selected_strategy_id: str,
    decision: StrategyDecision | None = None,
    signal: SignalObservation | None = None,
    position: PaperPosition | None = None,
    postmortem: Postmortem | None = None,
    lesson: Lesson | None = None,
    updated_ts: int | None = None,
) -> None:
    updated_ts = updated_ts or int(time.time())
    _write_json(
        var_dir / "runtime_state.json",
        {
            "event_type": "kraken_spot.runtime_state.v1",
            "updated_ts": updated_ts,
            "cycle_id": cycle_id,
            "cycle_number": cycle_number,
            "phase": phase,
            "status_line": status_line,
            "selected_strategy_id": selected_strategy_id,
            "strategies": [asdict(strategy) for strategy in strategies],
            "decision": asdict(decision) if decision else None,
            "signal": asdict(signal) if signal else None,
            "position": asdict(position) if position else None,
            "postmortem": asdict(postmortem) if postmortem else None,
            "lesson": asdict(lesson) if lesson else None,
        },
    )


def sleep_between_phases(seconds: Decimal) -> None:
    if seconds > 0:
        time.sleep(float(seconds))


def run_cycle(
    *,
    var_dir: Path,
    symbols: list[str],
    risk_budget_usd: Decimal,
    scenario: str,
    source: str,
    phase_delay_secs: Decimal = Decimal(0),
    now: int | None = None,
) -> dict[str, Any]:
    now = now or int(time.time())
    var_dir.mkdir(parents=True, exist_ok=True)
    cycle_number = _next_cycle_number(var_dir)
    cycle_id = f"kraken-cycle-{cycle_number:04d}"
    lessons = _latest_lessons(var_dir)
    strategies = generate_strategy_slate(
        symbols=symbols,
        lessons=lessons,
        risk_budget_usd=risk_budget_usd,
    )
    selected = strategies[0]
    decision = build_strategy_decision(
        cycle_id=cycle_id,
        created_ts=now,
        strategies=strategies,
        lessons=lessons,
    )

    write_runtime_state(
        var_dir=var_dir,
        cycle_id=cycle_id,
        cycle_number=cycle_number,
        phase="strategize",
        status_line="Strategy hypotheses ranked; selected Kraken Spot setup is ready.",
        strategies=strategies,
        selected_strategy_id=selected.id,
        decision=decision,
        updated_ts=now,
    )
    sleep_between_phases(phase_delay_secs)

    ticks = (
        fetch_kraken_public_ticks(selected.symbol, now=now)
        if source == "kraken-public"
        else simulated_ticks(selected.symbol, now=now, scenario=scenario)
    )
    signal = evaluate_signal(selected, ticks, cycle_id=cycle_id)
    write_runtime_state(
        var_dir=var_dir,
        cycle_id=cycle_id,
        cycle_number=cycle_number,
        phase="signal_watch",
        status_line=signal.reason,
        strategies=strategies,
        selected_strategy_id=selected.id,
        decision=decision,
        signal=signal,
        updated_ts=signal.created_ts,
    )
    sleep_between_phases(phase_delay_secs)

    if signal.passed:
        entry_position = PaperPosition(
            signal_id=signal.signal_id,
            strategy_id=selected.id,
            instrument_id=signal.instrument_id,
            market_title=f"Kraken Spot {selected.symbol} paper position",
            outcome=selected.title,
            symbol=selected.symbol,
            side="BUY",
            entry_price=_quantize_price(signal.reference_price),
            exit_price=None,
            current_price=_quantize_price(signal.reference_price),
            target_price=_quantize_price(signal.reference_price * Decimal("1.0055")),
            stop_price=_quantize_price(signal.reference_price * Decimal("0.9970")),
            size_usdc=_quantize_usd(signal.suggested_notional),
            opened_ts=signal.created_ts,
            closed_ts=None,
            pnl_usdc=Decimal(0),
            close_reason=None,
            status="OPEN",
        )
        write_runtime_state(
            var_dir=var_dir,
            cycle_id=cycle_id,
            cycle_number=cycle_number,
            phase="monitor_exit",
            status_line="Paper position entered; monitoring target, stop, and timebox.",
            strategies=strategies,
            selected_strategy_id=selected.id,
            decision=decision,
            signal=signal,
            position=entry_position,
            updated_ts=entry_position.opened_ts,
        )
        sleep_between_phases(phase_delay_secs)

        position = monitor_position(selected, signal, ticks, opened_ts=signal.created_ts)
        cycle = CycleResult(
            cycle_id=cycle_id,
            created_ts=position.closed_ts or signal.created_ts,
            status="CLOSED",
            phase="learn",
            selected_strategy_id=selected.id,
            signal_id=signal.signal_id,
            position=position,
            no_entry_reason=None,
        )
    else:
        cycle = CycleResult(
            cycle_id=cycle_id,
            created_ts=signal.created_ts,
            status="NO_ENTRY",
            phase="learn",
            selected_strategy_id=selected.id,
            signal_id=signal.signal_id,
            position=None,
            no_entry_reason=signal.reason,
        )

    postmortem = build_postmortem(cycle)
    write_runtime_state(
        var_dir=var_dir,
        cycle_id=cycle_id,
        cycle_number=cycle_number,
        phase="postmortem",
        status_line="Cycle complete; postmortem is reviewing entry, exit, and risk controls.",
        strategies=strategies,
        selected_strategy_id=selected.id,
        decision=decision,
        signal=signal,
        position=cycle.position,
        postmortem=postmortem,
        updated_ts=postmortem.created_ts,
    )
    sleep_between_phases(phase_delay_secs)

    lesson = build_lesson(postmortem)
    write_cycle_artifacts(
        var_dir=var_dir,
        strategies=strategies,
        decision=decision,
        signal=signal,
        cycle=cycle,
        postmortem=postmortem,
        lesson=lesson,
    )
    write_runtime_state(
        var_dir=var_dir,
        cycle_id=cycle_id,
        cycle_number=cycle_number,
        phase="learn",
        status_line=learn_status_line(postmortem),
        strategies=strategies,
        selected_strategy_id=selected.id,
        decision=decision,
        signal=signal,
        position=cycle.position,
        postmortem=postmortem,
        lesson=lesson,
        updated_ts=lesson.created_ts,
    )

    return {
        "mode": "paper",
        "venue": KRAKEN_VENUE,
        "product_type": "SPOT",
        "source": source,
        "scenario": scenario,
        "cycle_id": cycle.cycle_id,
        "phase": cycle.phase,
        "selected_strategy": selected.title,
        "decision_reason": decision.selected_reason,
        "signal_passed": signal.passed,
        "position_status": cycle.position.status if cycle.position else "NO_ENTRY",
        "pnl_usdc": float(cycle.position.pnl_usdc) if cycle.position else 0.0,
        "result": postmortem.result,
        "close_reason": postmortem.close_reason,
        "postmortem_next_adjustment": postmortem.next_adjustment,
        "lesson_action": lesson.action,
        "artifacts": str(var_dir),
    }


def run_cycles(
    *,
    var_dir: Path,
    symbols: list[str],
    risk_budget_usd: Decimal,
    scenario: str,
    source: str,
    cycle_count: int = 1,
    scenario_sequence: list[str] | None = None,
    phase_delay_secs: Decimal = Decimal(0),
    now: int | None = None,
) -> dict[str, Any]:
    count = max(1, cycle_count)
    sequence = scenario_sequence if scenario_sequence else [scenario]
    normalized_sequence = [item for item in sequence if item in SCENARIOS] or [scenario]
    base_now = now if now is not None else int(time.time())
    summaries: list[dict[str, Any]] = []

    for index in range(count):
        cycle_scenario = normalized_sequence[index % len(normalized_sequence)]
        summaries.append(
            run_cycle(
                var_dir=var_dir,
                symbols=symbols,
                risk_budget_usd=risk_budget_usd,
                scenario=cycle_scenario,
                source=source,
                phase_delay_secs=phase_delay_secs,
                now=base_now + index * 60,
            ),
        )

    aggregate_pnl = sum(
        Decimal(str(summary.get("pnl_usdc", 0))) for summary in summaries
    )
    last_summary = summaries[-1]
    trace = [
        SessionCycleTrace(
            cycle_id=str(summary["cycle_id"]),
            scenario=str(summary["scenario"]),
            result=str(summary["result"]),
            close_reason=str(summary["close_reason"]),
            pnl_usdc=Decimal(str(summary.get("pnl_usdc", 0))),
            lesson_action=str(summary["lesson_action"]),
            next_adjustment=str(summary["postmortem_next_adjustment"]),
        )
        for summary in summaries
    ]
    wins = sum(1 for item in trace if item.result == "win")
    losses = sum(1 for item in trace if item.result == "loss")
    no_entries = sum(1 for item in trace if item.result == "no_entry")
    latest_lesson_action = str(last_summary["lesson_action"])
    next_scenario = next_scenario_for_lesson(latest_lesson_action)
    next_recommendation = next_recommendation_for_lesson(latest_lesson_action)
    completed_ts = base_now + (count - 1) * 60 + 5
    runbook = SessionRunbook(
        session_id=f"kraken-session-{base_now}",
        started_ts=base_now,
        completed_ts=completed_ts,
        status="completed",
        cycle_count=count,
        scenario_sequence=[
            normalized_sequence[index % len(normalized_sequence)] for index in range(count)
        ],
        cycle_ids=[item.cycle_id for item in trace],
        aggregate_pnl_usdc=_quantize_usd(aggregate_pnl),
        wins=wins,
        losses=losses,
        no_entries=no_entries,
        latest_lesson_action=latest_lesson_action,
        next_cycle_scenario=next_scenario,
        next_cycle_recommendation=next_recommendation,
        operator_summary=(
            f"Completed {count} Kraken Spot paper cycle"
            f"{'' if count == 1 else 's'} with {wins} win"
            f"{'' if wins == 1 else 's'}, {losses} loss"
            f"{'' if losses == 1 else 'es'}, {no_entries} no-entry branch"
            f"{'' if no_entries == 1 else 'es'}, and "
            f"{_quantize_usd(aggregate_pnl)} USDC aggregate paper PnL."
        ),
        cycle_trace=trace,
    )
    write_session_runbook(var_dir=var_dir, runbook=runbook)

    return {
        "mode": "paper",
        "venue": KRAKEN_VENUE,
        "product_type": "SPOT",
        "source": source,
        "cycle_count": count,
        "scenario_sequence": [
            normalized_sequence[index % len(normalized_sequence)] for index in range(count)
        ],
        "completed_cycles": summaries,
        "aggregate_pnl_usdc": float(_quantize_usd(aggregate_pnl)),
        "last_cycle_id": last_summary["cycle_id"],
        "last_lesson_action": latest_lesson_action,
        "next_cycle_scenario": next_scenario,
        "next_cycle_recommendation": next_recommendation,
        "session_runbook": asdict(runbook),
        "artifacts": str(var_dir),
    }


def _decimal(value: str) -> Decimal:
    return Decimal(value)


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("cycle count must be at least 1")
    return parsed


def _scenario_sequence(value: str) -> list[str]:
    scenarios = [item.strip() for item in value.split(",") if item.strip()]
    invalid = [item for item in scenarios if item not in SCENARIOS]
    if invalid:
        valid = ", ".join(SCENARIOS)
        raise argparse.ArgumentTypeError(
            f"unknown scenario {invalid[0]!r}; expected one of {valid}",
        )
    if not scenarios:
        raise argparse.ArgumentTypeError("scenario sequence cannot be empty")
    return scenarios


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Kraken Spot paper autonomy cycle(s).")
    parser.add_argument(
        "--symbol",
        action="append",
        default=[],
        help="Kraken Spot symbol, e.g. BTC/USDT. Repeat for several symbols.",
    )
    parser.add_argument(
        "--var-dir",
        type=Path,
        default=DEFAULT_VAR_DIR,
        help="Directory for JSONL cycle artifacts.",
    )
    parser.add_argument(
        "--risk-budget-usd",
        type=_decimal,
        default=Decimal(25),
        help="Paper risk budget for the selected strategy.",
    )
    parser.add_argument(
        "--scenario",
        choices=SCENARIOS,
        default="target",
        help="Deterministic simulated market path when --source=simulated.",
    )
    parser.add_argument(
        "--scenario-sequence",
        type=_scenario_sequence,
        default=None,
        help=(
            "Comma-separated simulated scenario sequence for multi-cycle runs, "
            "for example target,no-entry,stop,timebox."
        ),
    )
    parser.add_argument(
        "--cycle-count",
        type=_positive_int,
        default=1,
        help="Number of paper cycles to run before exiting.",
    )
    parser.add_argument(
        "--source",
        choices=("simulated", "kraken-public"),
        default="simulated",
        help="Read deterministic simulated ticks or Kraken public ticker data.",
    )
    parser.add_argument(
        "--phase-delay-secs",
        type=_decimal,
        default=Decimal(0),
        help="Sleep between phase writes so the dashboard can show the live progression.",
    )
    return parser.parse_args()


def _symbols_from_args(args: argparse.Namespace) -> list[str]:
    symbols = [symbol.upper() for symbol in args.symbol if symbol.strip()]
    return symbols or ["BTC/USDT", "ETH/USDT"]


def main() -> None:
    args = _parse_args()
    summary = run_cycles(
        var_dir=args.var_dir,
        symbols=_symbols_from_args(args),
        risk_budget_usd=args.risk_budget_usd,
        scenario=args.scenario,
        scenario_sequence=args.scenario_sequence,
        source=args.source,
        cycle_count=args.cycle_count,
        phase_delay_secs=args.phase_delay_secs,
    )
    print(json.dumps(summary, default=_json_default, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
