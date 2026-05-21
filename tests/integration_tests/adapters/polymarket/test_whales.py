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

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from unittest.mock import MagicMock
from unittest.mock import Mock

import msgspec
import pytest

from examples.live.polymarket.polymarket_whale_signal_bot import _wallets_from_args
from nautilus_trader.adapters.polymarket.whales import PolymarketWhaleDataClient
from nautilus_trader.adapters.polymarket.whales import PolymarketWhaleSignalConfig
from nautilus_trader.adapters.polymarket.whales import PolymarketWhaleTrade
from nautilus_trader.adapters.polymarket.whales import build_whale_signals
from nautilus_trader.adapters.polymarket.whales import parse_whale_position
from nautilus_trader.adapters.polymarket.whales import parse_whale_trade


WALLET_1 = "0xe0904e088f7c17f72c97f1f87c9fa13dafbdc8ea"
WALLET_2 = "0xd53d94afcb32eb1db663118e5f830b48d83808ee"
CONDITION_ID = "0xdd22472e552920b8438158ea7238bfadfa4f736aa4cee91a6b86c39ead110917"
ASSET_ID = "21742633143463906290569050155826241533067272736897614950488156847949938836455"


def _trade_row(
    *,
    wallet: str = WALLET_1,
    side: str = "BUY",
    size: str = "1000",
    price: str = "0.60",
    timestamp: int = 1_729_000_000,
    asset_id: str = ASSET_ID,
) -> dict:
    return {
        "proxyWallet": wallet,
        "side": side,
        "asset": asset_id,
        "conditionId": CONDITION_ID,
        "size": size,
        "price": price,
        "timestamp": timestamp,
        "title": "Will a test market resolve Yes?",
        "slug": "test-market",
        "eventSlug": "test-event",
        "outcome": "Yes",
        "outcomeIndex": 0,
        "name": "whale",
        "pseudonym": "Whale",
        "transactionHash": "0xabc",
    }


def test_parse_whale_trade_normalizes_trade_row() -> None:
    trade = parse_whale_trade(_trade_row(side="buy", size="12.5", price="0.42"))

    assert trade.wallet == WALLET_1
    assert trade.side == "BUY"
    assert trade.asset_id == ASSET_ID
    assert trade.condition_id == CONDITION_ID
    assert trade.notional == Decimal("5.250")
    assert trade.slug == "test-market"


def test_parse_whale_position_normalizes_position_row() -> None:
    position = parse_whale_position(
        {
            "proxyWallet": WALLET_1.upper(),
            "asset": ASSET_ID,
            "conditionId": CONDITION_ID,
            "size": 125,
            "avgPrice": 0.4,
            "currentValue": 75,
            "curPrice": 0.6,
            "cashPnl": 10,
            "percentPnl": 0.2,
            "realizedPnl": 2,
            "redeemable": False,
            "title": "Will a test market resolve Yes?",
            "slug": "test-market",
            "eventSlug": "test-event",
            "outcome": "Yes",
        },
    )

    assert position.wallet == WALLET_1
    assert position.size == Decimal(125)
    assert position.avg_price == Decimal("0.4")
    assert position.current_value == Decimal(75)
    assert position.cur_price == Decimal("0.6")


def test_build_whale_signals_filters_scores_and_caps_notional() -> None:
    trades = [
        parse_whale_trade(_trade_row(wallet=WALLET_1, side="BUY", size="10000", price="0.60")),
        parse_whale_trade(_trade_row(wallet=WALLET_2, side="SELL", size="1000", price="0.50")),
        parse_whale_trade(_trade_row(wallet=WALLET_2, side="BUY", size="10", price="0.50")),
    ]
    config = PolymarketWhaleSignalConfig(
        min_trade_notional=Decimal(100),
        min_signal_notional=Decimal(1000),
        copy_fraction=Decimal("0.10"),
        max_order_notional=Decimal(250),
        wallet_weights={WALLET_1: Decimal(2)},
    )

    signals = build_whale_signals(trades, config=config, now_secs=1_729_000_100)

    assert len(signals) == 1
    signal = signals[0]
    assert signal.side == "BUY"
    assert signal.score_notional == Decimal("11500.00")
    assert signal.suggested_notional == Decimal(250)
    assert signal.trade_count == 2
    assert signal.wallets == tuple(sorted((WALLET_1, WALLET_2)))


def test_build_whale_signals_skips_old_flow() -> None:
    trades = [
        PolymarketWhaleTrade(
            wallet=WALLET_1,
            side="BUY",
            asset_id=ASSET_ID,
            condition_id=CONDITION_ID,
            size=Decimal(10000),
            price=Decimal("0.60"),
            timestamp=1_729_000_000,
        ),
    ]
    config = PolymarketWhaleSignalConfig(
        min_trade_notional=Decimal(100),
        min_signal_notional=Decimal(100),
        max_signal_age_secs=10,
    )

    assert build_whale_signals(trades, config=config, now_secs=1_729_000_100) == []


def test_wallets_from_args_normalizes_before_deduping(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POLYMARKET_WHALE_WALLETS", f"{WALLET_1},{WALLET_2.upper()}")
    args = SimpleNamespace(wallet=[WALLET_1.upper(), f" {WALLET_2} "])

    assert _wallets_from_args(args) == sorted((WALLET_1, WALLET_2))


@pytest.mark.asyncio
async def test_whale_client_fetch_recent_trades_uses_data_api_params() -> None:
    response = Mock()
    response.status = 200
    response.body = msgspec.json.encode([_trade_row()])

    http_client = MagicMock()
    http_client.get = AsyncMock(return_value=response)

    client = PolymarketWhaleDataClient(http_client=http_client, base_url="https://data.example")
    trades = await client.fetch_recent_trades(
        WALLET_1,
        market=CONDITION_ID,
        side="BUY",
        limit=25,
        offset=50,
    )

    assert len(trades) == 1
    http_client.get.assert_awaited_once_with(
        url="https://data.example/trades",
        params={
            "user": WALLET_1,
            "limit": "25",
            "offset": "50",
            "market": CONDITION_ID,
            "side": "BUY",
        },
    )


@pytest.mark.asyncio
async def test_whale_client_fetch_current_positions_uses_data_api_params() -> None:
    response = Mock()
    response.status = 200
    response.body = msgspec.json.encode(
        [
            {
                "proxyWallet": WALLET_1,
                "asset": ASSET_ID,
                "conditionId": CONDITION_ID,
                "size": 125,
                "avgPrice": 0.4,
                "currentValue": 75,
                "curPrice": 0.6,
            },
        ],
    )

    http_client = MagicMock()
    http_client.get = AsyncMock(return_value=response)

    client = PolymarketWhaleDataClient(http_client=http_client, base_url="https://data.example")
    positions = await client.fetch_current_positions(
        WALLET_1,
        limit=10,
        offset=20,
        size_threshold=Decimal(1),
    )

    assert len(positions) == 1
    http_client.get.assert_awaited_once_with(
        url="https://data.example/positions",
        params={
            "user": WALLET_1,
            "limit": "10",
            "offset": "20",
            "sizeThreshold": "1",
            "sortBy": "TOKENS",
            "sortDirection": "DESC",
        },
    )
