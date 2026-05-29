# Kraken Spot autonomy loop

This guide shows how to run the local Kraken Spot autonomy loop, watch it in
the dashboard or terminal, and understand the artifacts it writes after each
cycle.

<!-- prettier-ignore -->
> [!IMPORTANT]
> The current runner is paper-only. It reads simulated ticks or Kraken public
> ticker data, writes paper positions, and never submits live Kraken orders.

## What the loop does

Each single run executes one complete decision cycle. A loop run executes the
same five-phase cycle several times, appending a ledger row after each lesson is
written. The runner writes a live `runtime_state.json` file as it moves through
each phase, then appends the final JSONL rows after the lesson is written.
Each `strategize` phase also writes a strategy decision record that explains
why the selected hypothesis won and which prior lessons influenced that choice.
The decision includes vector scores for signal quality, spread discipline,
upside capture, downside protection, stale exposure, and lesson fit.
Each run also writes a session runbook that summarizes the loop, counts wins,
losses, and no-entry branches, and names the next cycle to rehearse.

The five phases are:

- `strategize`: Rank five Kraken Spot strategy hypotheses.
- `signal_watch`: Read price signals and decide whether the selected setup
  clears the entry gate.
- `monitor_exit`: Record a paper entry and monitor target, stop, and timebox.
- `postmortem`: Review the completed position cycle or no-entry result.
- `learn`: Write a lesson that informs the next strategy slate.

## Run the dashboard

Start the dashboard from the web package. It reads bot artifacts from
`var/kraken_spot_autonomy` by default.

```bash
cd polymarket/dashboard/web
./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3024
```

Open `http://127.0.0.1:3024`. The dashboard shows the latest runtime state if
`runtime_state.json` exists. Otherwise, it falls back to the JSONL ledger.

Use the segmented cycle path control to choose `Target`, `Stop`, `Timebox`, or
`No entry`, then use **Run one** in the autonomy panel to launch a single paper
cycle from the dashboard. Use **Loop x4** to run a four-cycle playbook that
starts with the selected path and then rotates through the remaining branches.
The server starts the runner, the dashboard polls `/api/autonomy/snapshot`, and
the phase rail moves through the same five runtime states written by the CLI.
The **Cycle ledger** section shows completed cycles, exit reasons, PnL, and the
lesson action written back into the next strategy slate.

## Run the terminal view

Use the terminal operator view when you want the same ranked strategy slate and
five-phase story without opening the browser. The terminal view shows the same
strategy vector scores as the dashboard. It reads `/api/autonomy/operator-flow`
from the running dashboard by default.

```bash
.venv/bin/python examples/live/kraken/kraken_spot_operator_tui.py
```

Use `--watch` to refresh the view while a paper cycle is running.

```bash
.venv/bin/python examples/live/kraken/kraken_spot_operator_tui.py --watch
```

Use `--file` to render a saved operator-flow JSON payload without a dashboard
server.

```bash
curl -sS http://127.0.0.1:3024/api/autonomy/operator-flow \
  > /tmp/kraken-operator-flow.json
.venv/bin/python examples/live/kraken/kraken_spot_operator_tui.py \
  --file /tmp/kraken-operator-flow.json \
  --no-color
```

## What you see as the operator

The dashboard is organized around the product loop, not raw logs. It shows the
morning-coffee view first, then the detailed evidence below it.

The main autonomy panel starts with **Run brief**. This is the first thing to
read when you open the dashboard. It shows the latest cycle, the current phase,
five-step progress, repeat readiness, the plain-language session result, and
the next recommended paper run. When the latest strategy decision includes
vector scores, the brief also shows the selected strategy's scorecard.

The same panel then shows:

- **Ideate:** A ranked strategy slate with the selected domain, constraint
  vector, entry rule, exit rule, confidence, risk budget, and strategy decision
  rationale. Each ranked idea shows its score vectors, and the rationale shows
  why the setup was selected and which recent lessons nudged the slate.
- **Read:** The latest signal decision, including pass or reject state,
  momentum, spread, confidence, suggested notional, and the reason the gate did
  or didn't clear.
- **Enter/exit:** The current paper position when one exists, including entry,
  mark or exit, target, stop, close reason, and cycle PnL. If no position
  enters, the same phase shows that capital stayed out.
- **Review:** The postmortem, including what happened and what the bot could
  have done differently.
- **Learn:** The feedback writeback that changes the next strategy slate. A
  target hit reinforces the setup, a stop cools down the symbol, a timebox
  warns against stale exposure, and a no-entry cycle loosens exactly one entry
  constraint.

The five story cards stay visible near the top of the panel so you can see
where the bot is in the loop without reading the JSONL files. The **Operator
timeline** below them repeats the same five phases with a decision headline,
evidence, metrics, and the next operator cue for each phase. In artifact-backed
mode, the dashboard reads `/api/autonomy/operator-flow` so the timeline includes
the same strategy rationale, lesson influence, dry-run reconciliation, and
session continuity that `kraken_spot_operator_tui.py` renders.

The **Session runbook** section shows continuity across cycles. It summarizes
the latest loop, shows aggregate paper PnL, counts wins, losses, and no-entry
branches, and gives the next-cycle recommendation that the next strategy slate
must consider. Use **Run rec** to launch the recommended next paper cycle from
`session_runbook.json` without manually selecting the scenario again.

The **Execution intent** panel shows the concrete order ticket for the latest
accepted signal. It includes the market IOC entry, the take-profit exit, the
stop-loss exit, the timebox exit, preflight checks, and the reconciliation
fields a live executor must write before the postmortem can trust the result.
Use **Record dry-run** to write an execution attempt and reconciliation record
without submitting an order. A dry run writes paper entry and exit fill legs in
the same shape a future live submitter must write for Kraken fills. The
**Submit live** control stays disabled in this build.

## Run one paper cycle

From the repository root, run a deterministic target-hit cycle.

```bash
.venv/bin/python examples/live/kraken/kraken_spot_autonomy_bot.py \
  --source simulated \
  --scenario target \
  --symbol BTC/USDT \
  --symbol ETH/USDT \
  --risk-budget-usd 25
```

The dashboard uses the same runner through `/api/autonomy/run`. The API
defaults to a simulated paper cycle with `BTC/USDT`, `ETH/USDT`, a `25` USD risk
budget, and a `2.5` second phase delay so each phase is visible between
dashboard polls. Send `scenario` as `target`, `stop`, `timebox`, or `no-entry`
to rehearse each product branch.

Send `scenario` as `recommended` to let the API read
`session_runbook.json.next_cycle_scenario` and launch the next paper cycle from
the latest session recommendation. If no runbook exists, the API falls back to
the safe simulated target branch.

Use `--phase-delay-secs` when you want to watch the dashboard move through the
phases in real time.

```bash
.venv/bin/python examples/live/kraken/kraken_spot_autonomy_bot.py \
  --source simulated \
  --scenario target \
  --symbol BTC/USDT \
  --symbol ETH/USDT \
  --risk-budget-usd 25 \
  --phase-delay-secs 1.5
```

## Run a paper loop

Use `--cycle-count` and `--scenario-sequence` to rehearse repeated product
cycles from the command line. The sequence rotates when the cycle count is
larger than the number of scenarios.

```bash
.venv/bin/python examples/live/kraken/kraken_spot_autonomy_bot.py \
  --source simulated \
  --scenario target \
  --scenario-sequence target,no-entry,stop,timebox \
  --cycle-count 4 \
  --symbol BTC/USDT \
  --symbol ETH/USDT \
  --risk-budget-usd 25 \
  --phase-delay-secs 1
```

Each completed cycle appends rows to `contract_cycles.jsonl`,
`contract_postmortems.jsonl`, and `strategy_lessons.jsonl`. The dashboard reads
those files into the **Cycle ledger** so you can inspect the repeated loop after
the runner exits. It also reads `session_runbook.json` so the **Session
runbook** section can show the loop-level result and the next cycle to run.

## Use Kraken public ticker data

Use `--source kraken-public` to read the current public ticker for the selected
symbol. This still does not use private keys and still does not submit orders.

```bash
.venv/bin/python examples/live/kraken/kraken_spot_autonomy_bot.py \
  --source kraken-public \
  --symbol BTC/USDT \
  --symbol ETH/USDT \
  --risk-budget-usd 25
```

## Configure artifact paths

The dashboard checks these environment variables in order:

- `KRAKEN_SPOT_BOT_VAR_DIR`
- `AUTONOMY_BOT_VAR_DIR`
- `POLIWALE_BOT_VAR_DIR`

If none are set, it reads `~/code/nautilus_trader/var/kraken_spot_autonomy`.
Use `KRAKEN_SPOT_BOT_VAR_DIR` when you want the dashboard to watch a temporary
or isolated artifact directory.

## Secret handling

Private Kraken keys are not required for the current paper runner. Keep them in
1Password and inject them only when a future live execution module explicitly
needs them.

For this workspace, the intended secret references are:

- `op://DeLoSecrets/Kraken/apiKey`
- `op://DeLoSecrets/Kraken/apiSecret`

Do not print those values in terminal output, logs, JSON artifacts, or tests.

## Live execution gate

The dashboard reads `/api/autonomy/readiness` and renders the
**Execution gate** panel in the main deck. This panel is the operator-facing
boundary between paper mode and any future live Kraken Spot executor. It never
returns secret values.

Live Kraken Spot stays blocked unless every required gate passes:

- `KRAKEN_SPOT_LIVE_ARMED=true`.
- `KRAKEN_SPOT_LIVE_CONFIRM=I_UNDERSTAND_LIVE_KRAKEN_SPOT_RISK`.
- `KRAKEN_SPOT_API_KEY` and `KRAKEN_SPOT_API_SECRET` are present.
- `KRAKEN_SPOT_LIVE_KILL_SWITCH` is unset or false.
- `KRAKEN_SPOT_MAX_NOTIONAL_USD` is greater than `0` and no greater than `100`.
- `KRAKEN_SPOT_DAILY_LOSS_LIMIT_USD` is greater than `0` and no greater than
  `250`.
- `KRAKEN_SPOT_SYMBOL_ALLOWLIST` contains explicit symbols, for example
  `BTC/USDT,ETH/USDT`.
- At least four paper cycles and a latest lesson exist in the local autonomy
  ledger.

When every gate passes, the panel reports `live ready`. That status only means
the operator gates are satisfied. It does not submit orders by itself; a
separate live executor must still be added and tested before real order
submission is possible.

The same readiness response includes the broader go-live roadmap. Use the
[Kraken Spot go-live checklist](KRAKEN_SPOT_GO_LIVE_CHECKLIST.md) as the
operator checklist for paper evidence, Kraken preflight, submitter safety,
reconciliation, rollback, and micro-live canary promotion.

## Operator flow API

The dashboard reads `/api/autonomy/operator-flow` to render the five-phase
operator timeline. A future TUI can use the same endpoint instead of rebuilding
its own interpretation of the artifacts.

The response includes:

- `summary`: The current plain-language cycle state.
- `nextOperatorAction`: What you check or do next.
- `repeatReady`: Whether the learn phase has written feedback for the next
  cycle.
- `strategySlate`: Ranked strategy hypotheses with domain, confidence, risk,
  entry rule, exit rule, constraint vector, selected state, and `vectorScores`
  when strategy decision artifacts are available.
- `steps`: Five rows in order: `ideate`, `read_signal`, `manage_position`,
  `postmortem`, and `learn`.

Each step includes `state`, `headline`, `detail`, `operatorCue`, `evidence`,
and `metrics`. The `ideate` step includes the latest strategy decision
rationale when `strategy_decisions.jsonl` or `runtime_state.json` contains one.
That rationale includes the selected reason, lesson influences, and the score
for the chosen strategy. When vector scores are available, the `ideate`
evidence includes the selected strategy's signal, spread, upside, downside,
stale exposure, and lesson-fit scores. The `manage_position` step includes
dry-run fill reconciliation when `execution_reconciliations.jsonl` contains a
completed entry and exit fill. For a no-entry cycle, the `manage_position` step
is marked `blocked`, not failed, because the bot intentionally kept capital out
of the market.

When `session_runbook.json` exists, the learn step includes the session summary
and next-cycle recommendation. This lets the dashboard and TUI show not only
what happened in the latest cycle, but what the full loop learned.

## Execution intent API

The dashboard reads `/api/autonomy/execution-intent` to show the order ticket
that would be submitted if a live executor existed and every live gate passed.
The endpoint reads the latest autonomy snapshot and readiness snapshot, then
returns a sanitized execution plan.

The response includes:

- `entry`: A Kraken Spot market IOC intent for the accepted signal.
- `exits`: Take-profit, stop-loss, and timebox exit intents for the acquired
  spot quantity.
- `checks`: Signal, ticket, allowlist, notional, readiness, and submitter
  preflight checks.
- `submission`: A disabled submission state with the current blockers.
- `reconciliation`: The live fields that must be captured after order
  submission, including order IDs, fill quantity, average fill price, fees,
  slippage, and realized PnL.

Even when the response status is `live-ready-dry-run`, `submission.enabled` is
always `false`. That value must stay false until a live submitter and live
reconciliation path are explicitly implemented and tested.

## Execution submit API

The dashboard uses `/api/autonomy/execution-submit` to record operator
execution attempts. This endpoint creates audit artifacts but never submits a
live Kraken order in the current build.

Use `GET /api/autonomy/execution-submit` to read the latest attempt and matching
reconciliation record. Use `POST /api/autonomy/execution-submit` with
`{"mode":"dry-run"}` to record the current ticket as a dry run.

A dry-run reconciliation includes:

- `entryFill`: The paper entry fill leg with client order ID, side, symbol,
  filled quantity, average fill price, notional, fee, and slippage fields.
- `exitFill`: The paper exit fill leg that matches the close reason: take
  profit, stop loss, or timebox.
- `fills`: The ordered fill legs for the attempted cycle.
- `readyForPostmortem`: Whether the entry and exit fills are complete enough
  for postmortem handoff.

The endpoint also accepts `{"mode":"live"}`, but live attempts are blocked
unless all readiness gates pass and these additional executor gates are present:

- `KRAKEN_SPOT_LIVE_EXECUTOR_ENABLED=true`.
- `KRAKEN_SPOT_LIVE_EXECUTOR_CONFIRM=I_ACCEPT_KRAKEN_SPOT_LIVE_ORDER_SUBMISSION`.

When every gate passes, the endpoint returns `LIVE_COMMAND_READY` and records a
non-submitting Nautilus command descriptor on the attempt as `liveCommand`. The
descriptor names the `KrakenLiveExecClientFactory`, `KrakenExecClientConfig`,
live Spot `CASH` account mode, env-only credential source, risk caps, entry
command, exit commands, and reconciliation contract. It still records
`submitted:false`, `submissionAllowed:false`, and `submitterImplemented:false`.

That boundary is intentional. A future live submitter must consume the
descriptor, convert it into Nautilus/Kraken order commands, record Kraken order
IDs, and reconcile fills before the postmortem consumes the cycle.

## Artifacts

The runner writes these files under the artifact directory:

- `runtime_state.json`: Live state for the current phase.
- `session_runbook.json`: Latest loop-level summary and next-cycle
  recommendation.
- `session_runbooks.jsonl`: Append-only session runbook history.
- `strategy_hypotheses.jsonl`: Strategy slate rows.
- `strategy_decisions.jsonl`: Strategy selection rationale, lesson influences,
  per-hypothesis scores, and vector scores for each ranked hypothesis.
- `signal_observations.jsonl`: Entry or no-entry signal rows.
- `contract_cycles.jsonl`: Completed paper cycle rows.
- `contract_postmortems.jsonl`: Postmortem rows.
- `strategy_lessons.jsonl`: Feedback rows for future strategy generation.
- `execution_attempts.jsonl`: Operator dry-run attempts, blocked live attempts,
  or non-submitting live command descriptors.
- `execution_reconciliations.jsonl`: Dry-run entry and exit fill records, or
  not-submitted live reconciliation placeholders.

## Go-live gate

Before enabling real Kraken order submission, add a separate live execution
mode with explicit operator controls:

- An `--execution-mode live` flag that defaults to paper.
- A max notional limit, per-symbol allowlist, and daily loss limit.
- A preflight that validates balances, fees, minimum order sizes, and key
  permissions.
- A submitter that converts the execution intent into Nautilus/Kraken order
  commands only after `/api/autonomy/readiness` passes.
- A post-order reconciliation step that records actual fills, fees, slippage,
  and order IDs.
- A kill switch that can flatten or cancel open orders.

Keep the paper loop as the acceptance test for strategy, postmortem, and
feedback behavior before live execution is wired in.
