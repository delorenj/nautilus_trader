export const MARKET_TITLES = [
  "BTC/USDT momentum impulse",
  "ETH/USDT relative strength",
  "SOL/USDT spread rebound",
  "BTC/USDT volatility compression",
  "ETH/USDT liquidity sweep",
  "XRP/USDT breakout retest",
  "ADA/USDT stop-distance check",
  "DOT/USDT mean reversion",
] as const;

export const WALLET_PSEUDONYMS = [
  "BTC Momentum",
  "ETH Relative Strength",
  "Spread Guard",
  "Volatility Gate",
  "Liquidity Sweep",
  "Stop Sentinel",
  "Timebox Watch",
  "No-Entry Scout",
] as const;

// 5 stable wallets per session - addresses generated deterministically.
export const STABLE_WALLET_COUNT = 5;

export type MockOutcomeFixture = {
  outcome: string;
  outcomeIndex: number;
  assetId: string;
};

export type MockMarketFixture = {
  title: (typeof MARKET_TITLES)[number];
  slug: string;
  eventSlug: string;
  conditionId: string;
  outcomes: readonly [MockOutcomeFixture, MockOutcomeFixture];
};

export const MARKET_FIXTURES: readonly MockMarketFixture[] = [
  {
    title: "BTC/USDT momentum impulse",
    slug: "btcusdt-momentum-impulse",
    eventSlug: "kraken-btcusdt",
    conditionId:
      "0x2a0f5d9b3c7e1a4d8f6b9c0e2d5a7f1b3c9d0e4a6f8b1c2d3e5f7a9b0c1d2e4f",
    outcomes: [
      {
        outcome: "Momentum long",
        outcomeIndex: 0,
        assetId:
          "7819483627194058362719405836271940583627194058362719405836271940583627",
      },
      {
        outcome: "No trade",
        outcomeIndex: 1,
        assetId:
          "4927361058492736105849273610584927361058492736105849273610584927361058",
      },
    ],
  },
  {
    title: "ETH/USDT relative strength",
    slug: "ethusdt-relative-strength",
    eventSlug: "kraken-ethusdt",
    conditionId:
      "0x83f1b6d0a4c9e2f7b5d8a1c3e6f9b0d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4e7f0",
    outcomes: [
      {
        outcome: "Relative long",
        outcomeIndex: 0,
        assetId:
          "6382910475638291047563829104756382910475638291047563829104756382910475",
      },
      {
        outcome: "Skip rotation",
        outcomeIndex: 1,
        assetId:
          "9274618305927461830592746183059274618305927461830592746183059274618305",
      },
    ],
  },
  {
    title: "SOL/USDT spread rebound",
    slug: "solusdt-spread-rebound",
    eventSlug: "kraken-solusdt",
    conditionId:
      "0x4c7a1e9f2b5d8a0c3e6f9b1d4a7c0e2f5b8d1a4c7e0f3b6d9a2c5e8f1b4d7a0c",
    outcomes: [
      {
        outcome: "Rebound long",
        outcomeIndex: 0,
        assetId:
          "3157092468315709246831570924683157092468315709246831570924683157092468",
      },
      {
        outcome: "Spread reject",
        outcomeIndex: 1,
        assetId:
          "8642039751864203975186420397518642039751864203975186420397518642039751",
      },
    ],
  },
  {
    title: "BTC/USDT volatility compression",
    slug: "btcusdt-volatility-compression",
    eventSlug: "kraken-btcusdt-compression",
    conditionId:
      "0xf5b8d1a4c7e0f3b6d9a2c5e8f1b4d7a0c3e6f9b2d5a8c1e4f7b0d3a6c9e2f5b8",
    outcomes: [
      {
        outcome: "Breakout long",
        outcomeIndex: 0,
        assetId:
          "5702468139570246813957024681395702468139570246813957024681395702468139",
      },
      {
        outcome: "Stay flat",
        outcomeIndex: 1,
        assetId:
          "2093847561209384756120938475612093847561209384756120938475612093847561",
      },
    ],
  },
  {
    title: "ETH/USDT liquidity sweep",
    slug: "ethusdt-liquidity-sweep",
    eventSlug: "kraken-ethusdt-liquidity",
    conditionId:
      "0xa1c4e7f0b3d6a9c2e5f8b1d4a7c0e3f6b9d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4",
    outcomes: [
      {
        outcome: "Sweep long",
        outcomeIndex: 0,
        assetId:
          "7531904826753190482675319048267531904826753190482675319048267531904826",
      },
      {
        outcome: "Liquidity reject",
        outcomeIndex: 1,
        assetId:
          "4862519730486251973048625197304862519730486251973048625197304862519730",
      },
    ],
  },
  {
    title: "XRP/USDT breakout retest",
    slug: "xrpusdt-breakout-retest",
    eventSlug: "kraken-xrpusdt",
    conditionId:
      "0xd6a9c2e5f8b1d4a7c0e3f6b9d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4e7f0b3d6a9",
    outcomes: [
      {
        outcome: "Retest long",
        outcomeIndex: 0,
        assetId:
          "1904826753190482675319048267531904826753190482675319048267531904826753",
      },
      {
        outcome: "Retest failed",
        outcomeIndex: 1,
        assetId:
          "6251973048625197304862519730486251973048625197304862519730486251973048",
      },
    ],
  },
  {
    title: "ADA/USDT stop-distance check",
    slug: "adausdt-stop-distance-check",
    eventSlug: "kraken-adausdt",
    conditionId:
      "0x7f0b3d6a9c2e5f8b1d4a7c0e3f6b9d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4e7f0b",
    outcomes: [
      {
        outcome: "Risk valid",
        outcomeIndex: 0,
        assetId:
          "3048625197304862519730486251973048625197304862519730486251973048625197",
      },
      {
        outcome: "Stop too wide",
        outcomeIndex: 1,
        assetId:
          "8195736240819573624081957362408195736240819573624081957362408195736240",
      },
    ],
  },
  {
    title: "DOT/USDT mean reversion",
    slug: "dotusdt-mean-reversion",
    eventSlug: "kraken-dotusdt",
    conditionId:
      "0xe5f8b1d4a7c0e3f6b9d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4e7f0b3d6a9c2e5f8",
    outcomes: [
      {
        outcome: "Reversion long",
        outcomeIndex: 0,
        assetId:
          "9573624081957362408195736240819573624081957362408195736240819573624081",
      },
      {
        outcome: "No edge",
        outcomeIndex: 1,
        assetId:
          "2468135709246813570924681357092468135709246813570924681357092468135709",
      },
    ],
  },
];
