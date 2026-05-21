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
Utilities for building experimental Polymarket whale-following signals.

The helpers in this module intentionally stop at signal generation. They fetch
public Data API activity, normalize it into typed records, and score recent
whale flow into Nautilus-friendly candidate intents. Order submission remains a
strategy-level decision where portfolio, venue, and compliance controls can be
applied explicitly.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from dataclasses import field
from decimal import Decimal
from typing import Any
from typing import Literal
from typing import cast

import msgspec

from nautilus_trader.adapters.polymarket.common.constants import POLYMARKET_HTTP_RATE_LIMIT
from nautilus_trader.core import nautilus_pyo3
from nautilus_trader.core.correctness import PyCondition


POLYMARKET_DATA_API_BASE_URL = "https://data-api.polymarket.com"

WhaleSide = Literal["BUY", "SELL"]


def _decimal(value: Any, default: str = "0") -> Decimal:
    if value is None:
        return Decimal(default)
    return Decimal(str(value))


def _normalize_wallet(wallet: str) -> str:
    PyCondition.valid_string(wallet, "wallet")
    return wallet.lower()


def _market_param(market: str | Iterable[str] | None) -> str | None:
    if market is None:
        return None
    if isinstance(market, str):
        return market
    return ",".join(market)


@dataclass(frozen=True)
class PolymarketWhaleTrade:
    """
    A normalized public Data API trade attributed to a profile wallet.
    """

    wallet: str
    side: WhaleSide
    asset_id: str
    condition_id: str
    size: Decimal
    price: Decimal
    timestamp: int
    title: str | None = None
    slug: str | None = None
    event_slug: str | None = None
    outcome: str | None = None
    outcome_index: int | None = None
    name: str | None = None
    pseudonym: str | None = None
    transaction_hash: str | None = None

    @property
    def notional(self) -> Decimal:
        """
        Return the approximate pUSD value crossing the book.
        """
        return abs(self.size * self.price)


@dataclass(frozen=True)
class PolymarketWhalePosition:
    """
    A normalized current public position for a profile wallet.
    """

    wallet: str
    asset_id: str
    condition_id: str
    size: Decimal
    avg_price: Decimal
    current_value: Decimal
    cur_price: Decimal
    cash_pnl: Decimal = Decimal(0)
    percent_pnl: Decimal = Decimal(0)
    realized_pnl: Decimal = Decimal(0)
    redeemable: bool = False
    title: str | None = None
    slug: str | None = None
    event_slug: str | None = None
    outcome: str | None = None


@dataclass(frozen=True)
class PolymarketWhaleSignalConfig:
    """
    Risk and scoring controls for whale-following signals.
    """

    min_trade_notional: Decimal = Decimal(1000)
    min_signal_notional: Decimal = Decimal(2500)
    copy_fraction: Decimal = Decimal("0.05")
    max_order_notional: Decimal = Decimal(100)
    max_signal_age_secs: int = 3600
    wallet_weights: dict[str, Decimal] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "wallet_weights",
            {wallet.lower(): _decimal(weight) for wallet, weight in self.wallet_weights.items()},
        )

    def weight_for_wallet(self, wallet: str) -> Decimal:
        """
        Return a configured wallet weight, defaulting to 1.
        """
        return self.wallet_weights.get(wallet.lower(), Decimal(1))


@dataclass(frozen=True)
class PolymarketWhaleSignal:
    """
    A candidate trade intent inferred from recent whale flow.
    """

    condition_id: str
    asset_id: str
    side: WhaleSide
    score_notional: Decimal
    suggested_notional: Decimal
    reference_price: Decimal
    trade_count: int
    latest_timestamp: int
    wallets: tuple[str, ...]
    title: str | None = None
    slug: str | None = None
    event_slug: str | None = None
    outcome: str | None = None


@dataclass(frozen=True)
class PolymarketWhaleScan:
    """
    Result of scanning one or more whale wallets.
    """

    trades: tuple[PolymarketWhaleTrade, ...]
    positions: tuple[PolymarketWhalePosition, ...]
    signals: tuple[PolymarketWhaleSignal, ...]


def parse_whale_trade(data: dict[str, Any]) -> PolymarketWhaleTrade:
    """
    Parse one Data API trade row into a typed whale trade.
    """
    side = str(data.get("side", "")).upper()
    if side not in {"BUY", "SELL"}:
        raise ValueError(f"Unsupported Polymarket trade side: {side!r}")
    trade_side = cast(WhaleSide, side)

    return PolymarketWhaleTrade(
        wallet=_normalize_wallet(str(data["proxyWallet"])),
        side=trade_side,
        asset_id=str(data["asset"]),
        condition_id=str(data["conditionId"]),
        size=_decimal(data.get("size")),
        price=_decimal(data.get("price")),
        timestamp=int(data["timestamp"]),
        title=data.get("title"),
        slug=data.get("slug"),
        event_slug=data.get("eventSlug"),
        outcome=data.get("outcome"),
        outcome_index=data.get("outcomeIndex"),
        name=data.get("name"),
        pseudonym=data.get("pseudonym"),
        transaction_hash=data.get("transactionHash"),
    )


def parse_whale_position(data: dict[str, Any]) -> PolymarketWhalePosition:
    """
    Parse one Data API position row into a typed whale position.
    """
    return PolymarketWhalePosition(
        wallet=_normalize_wallet(str(data["proxyWallet"])),
        asset_id=str(data["asset"]),
        condition_id=str(data["conditionId"]),
        size=_decimal(data.get("size")),
        avg_price=_decimal(data.get("avgPrice")),
        current_value=_decimal(data.get("currentValue")),
        cur_price=_decimal(data.get("curPrice")),
        cash_pnl=_decimal(data.get("cashPnl")),
        percent_pnl=_decimal(data.get("percentPnl")),
        realized_pnl=_decimal(data.get("realizedPnl")),
        redeemable=bool(data.get("redeemable", False)),
        title=data.get("title"),
        slug=data.get("slug"),
        event_slug=data.get("eventSlug"),
        outcome=data.get("outcome"),
    )


def build_whale_signals(
    trades: Iterable[PolymarketWhaleTrade],
    config: PolymarketWhaleSignalConfig | None = None,
    now_secs: int | None = None,
) -> list[PolymarketWhaleSignal]:
    """
    Aggregate recent whale trades into directional candidate signals.
    """
    cfg = config or PolymarketWhaleSignalConfig()
    grouped: dict[tuple[str, str], list[PolymarketWhaleTrade]] = {}

    for trade in trades:
        if trade.notional < cfg.min_trade_notional:
            continue
        if now_secs is not None and now_secs - trade.timestamp > cfg.max_signal_age_secs:
            continue
        grouped.setdefault((trade.condition_id, trade.asset_id), []).append(trade)

    signals: list[PolymarketWhaleSignal] = []
    for (condition_id, asset_id), group in grouped.items():
        score = Decimal(0)
        wallets: set[str] = set()
        latest = max(group, key=lambda trade: trade.timestamp)

        for trade in group:
            signed_notional = trade.notional if trade.side == "BUY" else -trade.notional
            score += signed_notional * cfg.weight_for_wallet(trade.wallet)
            wallets.add(trade.wallet)

        abs_score = abs(score)
        if abs_score < cfg.min_signal_notional:
            continue

        suggested_notional = min(abs_score * cfg.copy_fraction, cfg.max_order_notional)
        if suggested_notional <= 0:
            continue

        signals.append(
            PolymarketWhaleSignal(
                condition_id=condition_id,
                asset_id=asset_id,
                side="BUY" if score > 0 else "SELL",
                score_notional=score,
                suggested_notional=suggested_notional,
                reference_price=latest.price,
                trade_count=len(group),
                latest_timestamp=latest.timestamp,
                wallets=tuple(sorted(wallets)),
                title=latest.title,
                slug=latest.slug,
                event_slug=latest.event_slug,
                outcome=latest.outcome,
            ),
        )

    signals.sort(
        key=lambda signal: (abs(signal.score_notional), signal.latest_timestamp), reverse=True
    )
    return signals


class PolymarketWhaleDataClient:
    """
    Small public Data API client for whale-flow research.
    """

    def __init__(
        self,
        http_client: nautilus_pyo3.HttpClient | None = None,
        base_url: str | None = None,
    ) -> None:
        self._http_client = http_client or nautilus_pyo3.HttpClient(
            default_quota=nautilus_pyo3.Quota.rate_per_minute(POLYMARKET_HTTP_RATE_LIMIT),
        )
        self._base_url = (base_url or POLYMARKET_DATA_API_BASE_URL).rstrip("/")

    async def fetch_recent_trades(
        self,
        wallet: str,
        *,
        market: str | Iterable[str] | None = None,
        side: WhaleSide | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PolymarketWhaleTrade]:
        """
        Fetch recent trades for a whale wallet from ``GET /trades``.
        """
        params: dict[str, Any] = {
            "user": _normalize_wallet(wallet),
            "limit": str(limit),
            "offset": str(offset),
        }
        market_filter = _market_param(market)
        if market_filter is not None:
            params["market"] = market_filter
        if side is not None:
            params["side"] = side

        rows = await self._get_json("/trades", params=params)
        if not isinstance(rows, list):
            raise RuntimeError("Unexpected Polymarket /trades response shape")
        return [parse_whale_trade(row) for row in rows]

    async def fetch_current_positions(
        self,
        wallet: str,
        *,
        limit: int = 100,
        offset: int = 0,
        size_threshold: Decimal = Decimal(0),
    ) -> list[PolymarketWhalePosition]:
        """
        Fetch current positions for a whale wallet from ``GET /positions``.
        """
        params: dict[str, Any] = {
            "user": _normalize_wallet(wallet),
            "limit": str(limit),
            "offset": str(offset),
            "sizeThreshold": str(size_threshold),
            "sortBy": "TOKENS",
            "sortDirection": "DESC",
        }

        rows = await self._get_json("/positions", params=params)
        if not isinstance(rows, list):
            raise RuntimeError("Unexpected Polymarket /positions response shape")
        return [parse_whale_position(row) for row in rows]

    async def scan_wallets(
        self,
        wallets: Iterable[str],
        *,
        market: str | Iterable[str] | None = None,
        trades_limit: int = 100,
        include_positions: bool = False,
        signal_config: PolymarketWhaleSignalConfig | None = None,
        now_secs: int | None = None,
    ) -> PolymarketWhaleScan:
        """
        Fetch wallet activity and return scored whale-following signals.
        """
        trades: list[PolymarketWhaleTrade] = []
        positions: list[PolymarketWhalePosition] = []

        for wallet in wallets:
            trades.extend(
                await self.fetch_recent_trades(
                    wallet,
                    market=market,
                    limit=trades_limit,
                ),
            )
            if include_positions:
                positions.extend(await self.fetch_current_positions(wallet))

        return PolymarketWhaleScan(
            trades=tuple(trades),
            positions=tuple(positions),
            signals=tuple(build_whale_signals(trades, signal_config, now_secs)),
        )

    async def _get_json(self, path: str, params: dict[str, Any]) -> Any:
        response = await self._http_client.get(
            url=f"{self._base_url}{path}",
            params=params,
        )
        if response.status >= 400:
            body = response.body.decode("utf-8", errors="replace")
            raise RuntimeError(f"Polymarket Data API {path} failed with {response.status}: {body}")
        return msgspec.json.decode(response.body)
