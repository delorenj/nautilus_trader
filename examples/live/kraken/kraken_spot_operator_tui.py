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
Terminal operator view for the Kraken Spot autonomy loop.

The dashboard and this terminal view both consume the same product contract:
``/api/autonomy/operator-flow``. That endpoint turns the runner artifacts into
five operator-facing phases: ideate, read signal, manage position, postmortem,
and learn.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path
from textwrap import indent
from textwrap import wrap
from typing import Any
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen


DEFAULT_OPERATOR_FLOW_URL = "http://127.0.0.1:3024/api/autonomy/operator-flow"

ANSI = {
    "reset": "\033[0m",
    "bold": "\033[1m",
    "dim": "\033[2m",
    "complete": "\033[32m",
    "active": "\033[33m",
    "blocked": "\033[36m",
    "pending": "\033[90m",
    "negative": "\033[31m",
    "positive": "\033[32m",
    "warning": "\033[33m",
    "neutral": "\033[37m",
}

STATE_LABELS = {
    "complete": "DONE",
    "active": "NOW",
    "blocked": "SKIPPED",
    "pending": "NEXT",
}


def _style(text: str, tone: str, *, color: bool) -> str:
    if not color:
        return text
    return f"{ANSI.get(tone, '')}{text}{ANSI['reset']}"


def _terminal_width(default: int = 104) -> int:
    return max(72, min(132, shutil.get_terminal_size((default, 24)).columns))


def _wrap(text: str, *, width: int, prefix: str = "") -> str:
    if not text:
        return prefix

    return "\n".join(
        f"{prefix}{line}" for line in wrap(text, width=max(28, width - len(prefix)))
    )


def _metric_line(metrics: list[dict[str, Any]], *, color: bool) -> str:
    chunks = []
    for metric in metrics:
        label = str(metric.get("label", "")).upper()
        value = str(metric.get("value", "-"))
        tone = str(metric.get("tone", "neutral"))
        chunks.append(f"{label}: {_style(value, tone, color=color)}")
    return "  ".join(chunks)


def _confidence(value: Any) -> str:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return "-"
    return f"{numeric * 100:.0f}%"


def _money(value: Any) -> str:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return "-"
    return f"{numeric:.2f} USD"


def _short_vector_label(vector_id: str, label: str) -> str:
    labels = {
        "signal_quality": "signal",
        "spread_discipline": "spread",
        "upside_capture": "upside",
        "downside_protection": "downside",
        "stale_exposure": "stale",
        "lesson_fit": "lesson",
    }
    return labels.get(vector_id, label.lower().replace(" ", "_"))


def _vector_score_line(strategy: dict[str, Any]) -> str | None:
    raw_scores = strategy.get("vectorScores")
    if not isinstance(raw_scores, list):
        return None

    parts: list[str] = []
    for raw_score in raw_scores[:6]:
        if not isinstance(raw_score, dict):
            continue
        vector_id = str(raw_score.get("id", "score"))
        label = _short_vector_label(
            vector_id,
            str(raw_score.get("label", "score")),
        )
        try:
            score = float(raw_score.get("score"))
        except (TypeError, ValueError):
            continue
        parts.append(f"{label} {score:.0f}")

    if not parts:
        return None
    return "Vectors: " + " | ".join(parts)


def _render_strategy_slate(
    slate: list[Any],
    *,
    color: bool,
    width: int,
) -> list[str]:
    strategies = [item for item in slate if isinstance(item, dict)]
    if not strategies:
        return []

    lines = [_style("STRATEGY SLATE", "bold", color=color)]
    for strategy in strategies[:5]:
        rank = strategy.get("rank", "?")
        selected = "*" if strategy.get("selected") else " "
        title = str(strategy.get("title", "Untitled strategy"))
        domain = str(strategy.get("domain", "unknown"))
        confidence = _confidence(strategy.get("confidence"))
        risk = _money(strategy.get("riskBudgetUsd"))
        constraint = str(strategy.get("constraintVector", "no constraint vector"))
        entry_rule = str(strategy.get("entryRule", "No entry rule"))
        exit_rule = str(strategy.get("exitRule", "No exit rule"))

        headline = (
            f"  {selected} {rank}. {title} [{domain}] "
            f"confidence={confidence} risk={risk}"
        )
        tone = "active" if strategy.get("selected") else "neutral"
        lines.append(_style(headline, tone, color=color))
        lines.append(_wrap(f"Vector: {constraint}", width=width, prefix="       "))
        vector_line = _vector_score_line(strategy)
        if vector_line:
            lines.append(_wrap(vector_line, width=width, prefix="       "))
        lines.append(_wrap(f"Entry: {entry_rule}", width=width, prefix="       "))
        lines.append(_wrap(f"Exit: {exit_rule}", width=width, prefix="       "))
    lines.append("")
    return lines


def fetch_operator_flow(url: str, *, timeout: float = 5.0) -> dict[str, Any]:
    parsed_url = urlparse(url)
    if parsed_url.scheme not in {"http", "https"}:
        raise ValueError("operator flow URL must use http or https")

    with urlopen(url, timeout=timeout) as response:  # noqa: S310
        parsed = json.loads(response.read().decode("utf-8"))

    if not isinstance(parsed, dict):
        raise ValueError("operator flow response was not a JSON object")
    return parsed


def read_operator_flow(path: Path) -> dict[str, Any]:
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError(f"{path} did not contain a JSON object")
    return parsed


def render_operator_flow(
    flow: dict[str, Any],
    *,
    color: bool = True,
    width: int | None = None,
) -> str:
    width = width or _terminal_width()
    line = "─" * width
    title = "KRAKEN SPOT OPERATOR FLOW"
    cycle = str(flow.get("cycleId", "unknown-cycle"))
    phase = str(flow.get("phase", "unknown"))
    repeat = "READY" if flow.get("repeatReady") else "WAIT"
    summary = str(flow.get("summary", "No operator summary available."))
    next_action = str(flow.get("nextOperatorAction", "No next action available."))
    strategy_slate = flow.get("strategySlate", [])
    steps = flow.get("steps", [])
    if not isinstance(steps, list):
        steps = []
    if not isinstance(strategy_slate, list):
        strategy_slate = []

    lines = [
        _style(title, "bold", color=color),
        f"{cycle}  phase={phase}  repeat={repeat}",
        line,
        _wrap(summary, width=width),
        _wrap(f"Next: {next_action}", width=width),
        line,
    ]
    lines.extend(
        _render_strategy_slate(strategy_slate, color=color, width=width),
    )

    for raw_step in steps:
        if not isinstance(raw_step, dict):
            continue

        index = raw_step.get("index", "?")
        label = str(raw_step.get("label", "step")).upper()
        state = str(raw_step.get("state", "pending"))
        state_label = STATE_LABELS.get(state, state.upper())
        headline = str(raw_step.get("headline", "No headline."))
        detail = str(raw_step.get("detail", ""))
        cue = str(raw_step.get("operatorCue", ""))
        evidence = raw_step.get("evidence", [])
        metrics = raw_step.get("metrics", [])

        state_text = _style(state_label, state, color=color)
        lines.append(f"[{index}] {label:<16} {state_text}  {headline}")
        if detail:
            lines.append(_wrap(detail, width=width, prefix="    "))
        if cue:
            lines.append(_wrap(f"Operator cue: {cue}", width=width, prefix="    "))
        if isinstance(metrics, list) and metrics:
            lines.append(f"    {_metric_line(metrics, color=color)}")
        if isinstance(evidence, list) and evidence:
            evidence_lines = "\n".join(
                _wrap(f"- {item}", width=width, prefix="      ")
                for item in evidence[:5]
            )
            lines.append(indent(evidence_lines, ""))
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _clear() -> None:
    sys.stdout.write("\033[2J\033[H")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render the Kraken Spot five-phase operator flow in the terminal.",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_OPERATOR_FLOW_URL,
        help="Operator-flow API URL. Defaults to the local dashboard endpoint.",
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Read an operator-flow JSON file instead of calling the dashboard API.",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Refresh the terminal until interrupted.",
    )
    parser.add_argument(
        "--interval-secs",
        type=float,
        default=2.0,
        help="Refresh interval for --watch.",
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="Disable ANSI color output.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    color = not args.no_color

    while True:
        try:
            flow = read_operator_flow(args.file) if args.file else fetch_operator_flow(args.url)
            output = render_operator_flow(flow, color=color)
        except (OSError, URLError, ValueError, json.JSONDecodeError) as exc:
            output = (
                "KRAKEN SPOT OPERATOR FLOW\n"
                f"Unable to read operator flow: {exc}\n"
                f"Start the dashboard or pass --file. Expected URL: {args.url}\n"
            )

        if args.watch:
            _clear()
        sys.stdout.write(output)
        sys.stdout.flush()

        if not args.watch:
            return 0
        time.sleep(max(0.25, args.interval_secs))


if __name__ == "__main__":
    raise SystemExit(main())
