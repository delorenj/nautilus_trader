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

from examples.live.kraken.kraken_spot_operator_tui import render_operator_flow


def _flow(*, no_entry: bool = False) -> dict:
    return {
        "cycleId": "kraken-cycle-0042",
        "phase": "learn",
        "summary": (
            "No-entry branch completed; capital stayed out and the lesson is ready."
            if no_entry
            else "Lesson is written back; the next strategy slate can use it."
        ),
        "nextOperatorAction": "Start the next cycle and check whether the lesson was used.",
        "repeatReady": True,
        "strategySlate": [
            {
                "id": "btcusdt-momentum-continuation",
                "rank": 1,
                "domain": "crypto",
                "title": "BTC/USDT momentum continuation",
                "thesis": "Follow a clean spot impulse.",
                "entryRule": "Last price up at least 18 bps with spread <= 8 bps",
                "exitRule": "+55 bps target, -30 bps stop, 4 tick max hold",
                "constraintVector": "momentum with hard stop",
                "riskBudgetUsd": 25,
                "confidence": 0.72,
                "status": "learned",
                "selected": True,
                "vectorScores": [
                    {
                        "id": "signal_quality",
                        "label": "Signal quality",
                        "score": 72,
                        "rationale": "Confidence is 0.72.",
                    },
                    {
                        "id": "spread_discipline",
                        "label": "Spread discipline",
                        "score": 84,
                        "rationale": "Entry gate keeps spread bounded.",
                    },
                ],
            },
            {
                "id": "no-trade-quality-gate",
                "rank": 2,
                "domain": "crypto",
                "title": "No-trade quality gate",
                "thesis": "Preserve capital when the signal is not clean.",
                "entryRule": "Reject if impulse or spread misses by too much",
                "exitRule": "No entry writes a constraint lesson",
                "constraintVector": "capital preservation",
                "riskBudgetUsd": 0,
                "confidence": 0.47,
                "status": "candidate",
                "selected": False,
            },
        ],
        "steps": [
            {
                "id": "ideate",
                "phase": "strategize",
                "index": 1,
                "label": "Ideate",
                "state": "complete",
                "headline": "5 hypotheses ranked",
                "detail": "Picked BTC/USDT momentum continuation from crypto.",
                "operatorCue": "This is the coffee-list view.",
                "evidence": [
                    "Why now: target-hit lesson reinforced the setup.",
                    "Entry: momentum gate",
                    "Exit: target, stop, timebox",
                ],
                "metrics": [
                    {"label": "ideas", "value": "5", "tone": "neutral"},
                    {"label": "risk", "value": "25.00 USD", "tone": "neutral"},
                ],
            },
            {
                "id": "read_signal",
                "phase": "signal_watch",
                "index": 2,
                "label": "Read signal",
                "state": "complete",
                "headline": "Signal failed; no entry" if no_entry else "Signal passed",
                "detail": "Momentum and spread satisfied selected constraints.",
                "operatorCue": "This answers whether the bot bought, waited, or skipped.",
                "evidence": ["BTC/USDT BUY at 100.23."],
                "metrics": [
                    {
                        "label": "signal",
                        "value": "fail" if no_entry else "pass",
                        "tone": "warning" if no_entry else "positive",
                    },
                ],
            },
            {
                "id": "manage_position",
                "phase": "monitor_exit",
                "index": 3,
                "label": "Manage position",
                "state": "blocked" if no_entry else "complete",
                "headline": "Position skipped" if no_entry else "Exited by target",
                "detail": (
                    "No capital is deployed for this cycle."
                    if no_entry
                    else "PnL is +0.14 USD on 25.00 USD paper notional."
                ),
                "operatorCue": "This is where loss mitigation and upside capture are visible.",
                "evidence": ["Exited by target for +0.14 USD."],
                "metrics": [
                    {"label": "pnl", "value": "0.00 USD" if no_entry else "+0.14 USD", "tone": "positive"},
                ],
            },
            {
                "id": "postmortem",
                "phase": "postmortem",
                "index": 4,
                "label": "Postmortem",
                "state": "complete",
                "headline": "Postmortem written",
                "detail": "Keep the setup as evidence.",
                "operatorCue": "This names what the bot could have done better.",
                "evidence": ["Next adjustment: preserve constraints."],
                "metrics": [{"label": "quality", "value": "good", "tone": "neutral"}],
            },
            {
                "id": "learn",
                "phase": "learn",
                "index": 5,
                "label": "Learn",
                "state": "active",
                "headline": "Lesson written back",
                "detail": "Re-use the entry shape.",
                "operatorCue": "This is the feedback loop.",
                "evidence": ["Next cycle action: reinforce target hit setup."],
                "metrics": [{"label": "repeat", "value": "ready", "tone": "positive"}],
            },
        ],
    }


def test_render_operator_flow_prints_the_five_phase_story() -> None:
    rendered = render_operator_flow(_flow(), color=False, width=100)

    assert "KRAKEN SPOT OPERATOR FLOW" in rendered
    assert "kraken-cycle-0042" in rendered
    assert "[1] IDEATE" in rendered
    assert "STRATEGY SLATE" in rendered
    assert "* 1. BTC/USDT momentum continuation" in rendered
    assert "Vectors: signal 72 | spread 84" in rendered
    assert "2. No-trade quality gate" in rendered
    assert "[2] READ SIGNAL" in rendered
    assert "[3] MANAGE POSITION" in rendered
    assert "[4] POSTMORTEM" in rendered
    assert "[5] LEARN" in rendered
    assert "Why now: target-hit lesson reinforced the setup" in rendered
    assert "Signal passed" in rendered
    assert "PnL is +0.14 USD" in rendered
    assert "Next:" in rendered


def test_render_operator_flow_marks_no_entry_as_skipped_not_failed() -> None:
    rendered = render_operator_flow(_flow(no_entry=True), color=False, width=100)

    assert "No-entry branch completed" in rendered
    assert "[3] MANAGE POSITION  SKIPPED" in rendered
    assert "Position skipped" in rendered
    assert "No capital is deployed" in rendered
