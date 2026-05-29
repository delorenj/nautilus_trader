# Kraken Spot go-live checklist

This checklist defines the acceptance criteria for moving the Kraken Spot bot
from paper and dry-run execution toward a controlled micro-live canary. It is a
risk-control checklist, not an income guarantee. Crypto trading can lose money,
and the first goal is bounded exposure, complete audit records, and a reliable
stop path.

<!-- prettier-ignore -->
> [!IMPORTANT]
> The current implementation must stay paper-only until every required item in
> `/api/autonomy/readiness` passes and the live submitter is implemented,
> reviewed, and verified.

## Current status

The current build has a working paper autonomy loop, dry-run execution
artifacts, and a dashboard readiness gate. It does not submit live Kraken
orders.

The dashboard reports two layers:

- **Execution gate:** A small hard gate for live arming, credentials, risk caps,
  symbol allowlist, kill switch, and paper evidence.
- **Go-live roadmap:** A broader acceptance checklist for strategy evidence,
  Kraken preflight, submitter safety, reconciliation, operations, and canary
  promotion.

## Phase 0: Paper loop acceptance

This phase proves that the bot can strategize, enter a simulated position, exit
it, write a postmortem, and feed the lesson into the next cycle.

Required checkmarks:

- Run at least `KRAKEN_SPOT_MIN_PAPER_CYCLES` paper cycles. The default target
  is `20`.
- Cover target, stop, timebox, and no-entry branches.
- Confirm the latest cycle writes a lesson for the next strategy slate.
- Approve a paper performance report with fees, slippage assumptions, drawdown,
  and branch-level outcomes.

## Phase 1: Operator and budget controls

This phase proves that live execution can only happen after explicit operator
intent and tight real-money caps.

Required checkmarks:

- Keep paper mode as the default.
- Set `KRAKEN_SPOT_LIVE_ARMED=true` only for the live canary window.
- Set
  `KRAKEN_SPOT_LIVE_CONFIRM=I_UNDERSTAND_LIVE_KRAKEN_SPOT_RISK`.
- Keep `KRAKEN_SPOT_LIVE_KILL_SWITCH` unset or false during the canary.
- Set an explicit symbol allowlist, for example `BTC/USDT,ETH/USDT`.
- Cap the first canary at no more than `5` USD per order.
- Cap the first canary at no more than `25` USD daily loss.
- Set `KRAKEN_SPOT_MAX_DAILY_ORDERS` to `1` through `6`.

## Phase 2: Kraken preflight

This phase proves that private Kraken access works and that order parameters are
valid before a submitter is allowed to place real orders.

Required checkmarks:

- Use `GetApiKeyInfo` to verify the active key without exposing secret values.
  Kraken documents that this endpoint returns key information such as
  permissions and restrictions.
- Verify the key can query balances. Kraken documents that `Balance` requires
  `Funds permissions - Query`.
- Verify the key can create and cancel Spot orders. Kraken documents that
  `AddOrder` requires `Orders and trades - Create & modify orders`, while
  `CancelAll` can use create or cancel permissions.
- Use `AssetPairs` to verify allowlisted pairs, price precision, quantity
  precision, order minimums, and leverage settings.
- Verify quote-currency cost minimums. Kraken documents a `0.5` USDT and
  `0.5` USDC cost minimum.
- Verify submit, cancel, and polling cadence against Kraken REST and matching
  engine limits. Kraken documents REST call counters and matching-engine order
  counters separately.

Set these environment confirmations only after the checks are complete:

- `KRAKEN_SPOT_PREFLIGHT_PERMISSIONS_OK=true`
- `KRAKEN_SPOT_PREFLIGHT_BALANCES_OK=true`
- `KRAKEN_SPOT_PREFLIGHT_ASSET_PAIRS_OK=true`
- `KRAKEN_SPOT_PREFLIGHT_COST_MINIMUMS_OK=true`
- `KRAKEN_SPOT_PREFLIGHT_RATE_LIMITS_OK=true`

## Phase 3: Submitter safety

This phase turns the existing non-submitting Nautilus command descriptor into a
small audited submitter.

Required checkmarks:

- Implement a live submitter that consumes the descriptor from
  `live-executor.ts`.
- Keep `submissionAllowed:false` until code review and tests pass.
- Enforce `KRAKEN_SPOT_MAX_OPEN_ORDERS` with a first-canary range of `1`
  through `3`.
- Enforce `KRAKEN_SPOT_MAX_SLIPPAGE_BPS` with a first-canary range of `1`
  through `50`.
- Reject any order that violates symbol allowlist, notional cap, daily loss cap,
  open-order cap, price precision, quantity precision, or order minimums.
- Require the entry order ID, acceptance timestamp, and filled quantity before
  any exit order can be armed.

## Phase 4: Reconciliation and postmortem

This phase proves that every real order cycle produces enough evidence for the
feedback loop to trust the result.

Required checkmarks:

- Persist Kraken order ID, client order ID, submitted time, accepted time,
  filled quantity, average fill price, fees, fee currency, slippage, and
  realized PnL.
- Mark the cycle ready for postmortem only after entry and exit fills reconcile.
- Include fees and slippage in the postmortem.
- Write the lesson after reconciliation, not after order submission.
- Keep all artifacts redacted. Never write API keys or secrets to JSONL,
  terminal output, screenshots, or tests.

## Phase 5: Operations and rollback

This phase proves that the bot can be stopped from another terminal or machine
without guessing.

Required checkmarks:

- Verify dashboard health and artifact writes from another machine on the
  network.
- Verify process supervision and restart behavior.
- Drill disabling live env flags.
- Drill activating `KRAKEN_SPOT_LIVE_KILL_SWITCH`.
- Drill canceling open orders through Kraken.
- Drill confirming no open live exposure remains.
- Set `KRAKEN_SPOT_LIVE_MONITORING_OK=true` only after monitoring works.
- Set `KRAKEN_SPOT_LIVE_ROLLBACK_DRILLED=true` only after the rollback drill.

## Phase 6: Micro-live canary

This phase is the first real-money stage. It must be intentionally small.

Required checkmarks:

- Run one allowlisted symbol.
- Run one entry and its planned exit path.
- Keep the first order at or below `5` USD notional.
- Stop immediately after any API error, orphan order, unexpected partial fill,
  slippage breach, reconciliation gap, or dashboard artifact write failure.
- Approve a canary review before any scale-up by setting
  `KRAKEN_SPOT_CANARY_REVIEW_APPROVED=true`.

## Scale-up rule

Do not promote the bot into unattended passive mode after one good trade. Raise
limits only after a reviewed live sample shows stable fill quality, complete
reconciliation, no orphan exposure, bounded drawdown, and useful lessons.

The desired end state is controlled risk and boring operations. Any income is a
result to measure after the safety loop is proven, not a guarantee to assume.

## References

Use the Kraken docs as the source of truth when the exchange behavior changes:

- [Kraken Spot Add Order](https://docs.kraken.com/api/docs/rest-api/add-order/)
- [Kraken Get API Key Info](https://docs.kraken.com/api/docs/rest-api/get-api-key-info/)
- [Kraken Get Account Balance](https://docs.kraken.com/api/docs/rest-api/get-account-balance/)
- [Kraken AssetPairs](https://docs.kraken.com/api/docs/rest-api/get-tradable-asset-pairs/)
- [Kraken Spot REST rate limits](https://docs.kraken.com/api/docs/guides/spot-rest-ratelimits/)
- [Kraken Spot trading limits](https://docs.kraken.com/api/docs/guides/spot-ratelimits/)
- [Kraken cost minimums](https://support.kraken.com/articles/12425041458708-cost-minimum-for-trading)

## Next steps

Build the missing pieces in this order:

1. Add a private Kraken preflight command that records redacted pass/fail
   results.
2. Add submitter tests against mocked Nautilus/Kraken clients.
3. Implement the smallest live submitter path.
4. Add live reconciliation artifacts.
5. Add cancel-all and flatten drills.
6. Run the micro-live canary only after the dashboard checklist is clean.
