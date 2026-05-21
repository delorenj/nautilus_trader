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
Dry-run Polymarket whale-flow signal scanner.

This example fetches public Data API activity for one or more watched wallets,
scores recent buy/sell flow, and prints Nautilus-friendly candidate intents.
It does not submit orders.

Usage:
    python examples/live/polymarket/polymarket_whale_signal_bot.py \
        --wallet 0x0000000000000000000000000000000000000000 \
        --market 0xdd22472e552920b8438158ea7238bfadfa4f736aa4cee91a6b86c39ead110917

Wallets can also be supplied as a comma-separated POLYMARKET_WHALE_WALLETS env var.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from decimal import Decimal
from typing import Any

from nautilus_trader.adapters.polymarket import PolymarketWhaleDataClient
from nautilus_trader.adapters.polymarket import PolymarketWhaleSignal
from nautilus_trader.adapters.polymarket import PolymarketWhaleSignalConfig
from nautilus_trader.adapters.polymarket import get_polymarket_instrument_id


def _decimal(value: str) -> Decimal:
    return Decimal(value)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan Polymarket whale wallets in dry-run mode.")
    parser.add_argument(
        "--wallet",
        action="append",
        default=[],
        help="Watched wallet address. Repeat for multiple wallets.",
    )
    parser.add_argument(
        "--market",
        help="Optional condition ID filter. Omit to scan all recent wallet activity.",
    )
    parser.add_argument("--limit", type=int, default=100, help="Trades to fetch per wallet.")
    parser.add_argument(
        "--min-trade-notional",
        type=_decimal,
        default=Decimal(1000),
        help="Ignore individual whale trades below this approximate pUSD notional.",
    )
    parser.add_argument(
        "--min-signal-notional",
        type=_decimal,
        default=Decimal(2500),
        help="Ignore aggregate signals below this absolute pUSD notional.",
    )
    parser.add_argument(
        "--copy-fraction",
        type=_decimal,
        default=Decimal("0.05"),
        help="Fraction of aggregate whale notional to copy into a candidate order.",
    )
    parser.add_argument(
        "--max-order-notional",
        type=_decimal,
        default=Decimal(100),
        help="Maximum candidate order notional emitted per signal.",
    )
    parser.add_argument(
        "--max-signal-age-secs",
        type=int,
        default=3600,
        help="Ignore trades older than this age.",
    )
    parser.add_argument(
        "--include-positions",
        action="store_true",
        help="Also fetch current whale positions for context.",
    )
    return parser.parse_args()


def _wallets_from_args(args: argparse.Namespace) -> list[str]:
    wallets = [wallet.strip().lower() for wallet in args.wallet if wallet.strip()]
    env_wallets = os.getenv("POLYMARKET_WHALE_WALLETS", "")
    wallets.extend(wallet.strip().lower() for wallet in env_wallets.split(",") if wallet.strip())
    return sorted(set(wallets))


def _signal_to_dict(signal: PolymarketWhaleSignal) -> dict[str, Any]:
    instrument_id = get_polymarket_instrument_id(signal.condition_id, signal.asset_id)
    return {
        "instrument_id": str(instrument_id),
        "condition_id": signal.condition_id,
        "asset_id": signal.asset_id,
        "side": signal.side,
        "score_notional": str(signal.score_notional),
        "suggested_notional": str(signal.suggested_notional),
        "reference_price": str(signal.reference_price),
        "trade_count": signal.trade_count,
        "latest_timestamp": signal.latest_timestamp,
        "wallets": list(signal.wallets),
        "title": signal.title,
        "slug": signal.slug,
        "event_slug": signal.event_slug,
        "outcome": signal.outcome,
    }


async def _run() -> None:
    args = _parse_args()
    wallets = _wallets_from_args(args)
    if not wallets:
        raise SystemExit("Provide --wallet or POLYMARKET_WHALE_WALLETS.")

    signal_config = PolymarketWhaleSignalConfig(
        min_trade_notional=args.min_trade_notional,
        min_signal_notional=args.min_signal_notional,
        copy_fraction=args.copy_fraction,
        max_order_notional=args.max_order_notional,
        max_signal_age_secs=args.max_signal_age_secs,
    )

    client = PolymarketWhaleDataClient()
    scan = await client.scan_wallets(
        wallets,
        market=args.market,
        trades_limit=args.limit,
        include_positions=args.include_positions,
        signal_config=signal_config,
        now_secs=int(time.time()),
    )

    output = {
        "mode": "dry_run",
        "wallets": wallets,
        "market": args.market,
        "trades_seen": len(scan.trades),
        "positions_seen": len(scan.positions),
        "signals": [_signal_to_dict(signal) for signal in scan.signals],
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(_run())
