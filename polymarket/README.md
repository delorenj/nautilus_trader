# Polymarket Whale Bot Experiment

This directory captures the local experiment requested in `AGENTS.md`: use the
existing NautilusTrader Polymarket adapter to explore a whale-following trading
bot.

The first implementation is deliberately dry-run only. It watches public
Polymarket Data API activity for configured wallets, aggregates recent whale
buy/sell flow, and emits Nautilus-friendly candidate intents with:

- `condition_id`
- `asset_id`
- Nautilus `instrument_id`
- inferred `BUY` or `SELL` side
- score notional and capped suggested notional

## Files

- `nautilus_trader/adapters/polymarket/whales.py` - reusable public Data API
  client, typed whale trade/position models, and signal scoring.
- `examples/live/polymarket/polymarket_whale_signal_bot.py` - dry-run CLI that
  prints candidate signals as JSON and never submits orders.
- `tests/integration_tests/adapters/polymarket/test_whales.py` - focused tests
  for parsing, scoring, and Data API request shape.

## Run

```bash
python examples/live/polymarket/polymarket_whale_signal_bot.py \
  --wallet 0x0000000000000000000000000000000000000000 \
  --market 0xdd22472e552920b8438158ea7238bfadfa4f736aa4cee91a6b86c39ead110917
```

Wallets can also be supplied with:

```bash
export POLYMARKET_WHALE_WALLETS="0xwallet1,0xwallet2"
```

## Next

Before this becomes a live strategy, add a Nautilus `Strategy` that consumes
these signals, subscribes to the referenced instruments, checks portfolio risk,
and requires an explicit live-execution flag before any order is submitted.
