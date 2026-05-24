export const MARKET_TITLES = [
  "Fed cuts rates by June 2026",
  "BTC above $125k by 2026-07-01",
  "2026 Senate margin between 4 and 6 seats",
  "Eurozone enters recession in 2026 Q3",
  "OpenAI announces GPT-6 before 2026-09-30",
  "Real Madrid wins 2025-26 UCL",
  "Apple ships smart glasses in 2026",
  "Brazil reaches >75% renewable grid in 2026",
] as const;

export const WALLET_PSEUDONYMS = [
  "Cobalt Whale",
  "Yellow Submarine",
  "Saffron Hand",
  "Quiet Mountain",
  "Glacier Squad",
  "Bone Trader",
  "Dust Devil",
  "Pale Horse",
] as const;

// 5 stable wallets per session - addresses generated deterministically.
export const STABLE_WALLET_COUNT = 5;

export type MockOutcomeFixture = {
  outcome: "Yes" | "No";
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
    title: "Fed cuts rates by June 2026",
    slug: "fed-cuts-rates-by-june-2026",
    eventSlug: "fed-policy-2026",
    conditionId:
      "0x2a0f5d9b3c7e1a4d8f6b9c0e2d5a7f1b3c9d0e4a6f8b1c2d3e5f7a9b0c1d2e4f",
    outcomes: [
      {
        outcome: "Yes",
        outcomeIndex: 0,
        assetId:
          "7819483627194058362719405836271940583627194058362719405836271940583627",
      },
      {
        outcome: "No",
        outcomeIndex: 1,
        assetId:
          "4927361058492736105849273610584927361058492736105849273610584927361058",
      },
    ],
  },
  {
    title: "BTC above $125k by 2026-07-01",
    slug: "btc-above-125k-by-2026-07-01",
    eventSlug: "bitcoin-price-2026",
    conditionId:
      "0x83f1b6d0a4c9e2f7b5d8a1c3e6f9b0d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4e7f0",
    outcomes: [
      {
        outcome: "Yes",
        outcomeIndex: 0,
        assetId:
          "6382910475638291047563829104756382910475638291047563829104756382910475",
      },
      {
        outcome: "No",
        outcomeIndex: 1,
        assetId:
          "9274618305927461830592746183059274618305927461830592746183059274618305",
      },
    ],
  },
  {
    title: "2026 Senate margin between 4 and 6 seats",
    slug: "2026-senate-margin-between-4-and-6-seats",
    eventSlug: "senate-control-2026",
    conditionId:
      "0x4c7a1e9f2b5d8a0c3e6f9b1d4a7c0e2f5b8d1a4c7e0f3b6d9a2c5e8f1b4d7a0c",
    outcomes: [
      {
        outcome: "Yes",
        outcomeIndex: 0,
        assetId:
          "3157092468315709246831570924683157092468315709246831570924683157092468",
      },
      {
        outcome: "No",
        outcomeIndex: 1,
        assetId:
          "8642039751864203975186420397518642039751864203975186420397518642039751",
      },
    ],
  },
  {
    title: "Eurozone enters recession in 2026 Q3",
    slug: "eurozone-enters-recession-in-2026-q3",
    eventSlug: "eurozone-macro-2026",
    conditionId:
      "0xf5b8d1a4c7e0f3b6d9a2c5e8f1b4d7a0c3e6f9b2d5a8c1e4f7b0d3a6c9e2f5b8",
    outcomes: [
      {
        outcome: "Yes",
        outcomeIndex: 0,
        assetId:
          "5702468139570246813957024681395702468139570246813957024681395702468139",
      },
      {
        outcome: "No",
        outcomeIndex: 1,
        assetId:
          "2093847561209384756120938475612093847561209384756120938475612093847561",
      },
    ],
  },
  {
    title: "OpenAI announces GPT-6 before 2026-09-30",
    slug: "openai-announces-gpt-6-before-2026-09-30",
    eventSlug: "ai-labs-2026",
    conditionId:
      "0xa1c4e7f0b3d6a9c2e5f8b1d4a7c0e3f6b9d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4",
    outcomes: [
      {
        outcome: "Yes",
        outcomeIndex: 0,
        assetId:
          "7531904826753190482675319048267531904826753190482675319048267531904826",
      },
      {
        outcome: "No",
        outcomeIndex: 1,
        assetId:
          "4862519730486251973048625197304862519730486251973048625197304862519730",
      },
    ],
  },
  {
    title: "Real Madrid wins 2025-26 UCL",
    slug: "real-madrid-wins-2025-26-ucl",
    eventSlug: "champions-league-2025-26",
    conditionId:
      "0xd6a9c2e5f8b1d4a7c0e3f6b9d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4e7f0b3d6a9",
    outcomes: [
      {
        outcome: "Yes",
        outcomeIndex: 0,
        assetId:
          "1904826753190482675319048267531904826753190482675319048267531904826753",
      },
      {
        outcome: "No",
        outcomeIndex: 1,
        assetId:
          "6251973048625197304862519730486251973048625197304862519730486251973048",
      },
    ],
  },
  {
    title: "Apple ships smart glasses in 2026",
    slug: "apple-ships-smart-glasses-in-2026",
    eventSlug: "consumer-hardware-2026",
    conditionId:
      "0x7f0b3d6a9c2e5f8b1d4a7c0e3f6b9d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4e7f0b",
    outcomes: [
      {
        outcome: "Yes",
        outcomeIndex: 0,
        assetId:
          "3048625197304862519730486251973048625197304862519730486251973048625197",
      },
      {
        outcome: "No",
        outcomeIndex: 1,
        assetId:
          "8195736240819573624081957362408195736240819573624081957362408195736240",
      },
    ],
  },
  {
    title: "Brazil reaches >75% renewable grid in 2026",
    slug: "brazil-reaches-75-renewable-grid-in-2026",
    eventSlug: "brazil-energy-2026",
    conditionId:
      "0xe5f8b1d4a7c0e3f6b9d2a5c8e1f4b7d0a3c6e9f2b5d8a1c4e7f0b3d6a9c2e5f8",
    outcomes: [
      {
        outcome: "Yes",
        outcomeIndex: 0,
        assetId:
          "9573624081957362408195736240819573624081957362408195736240819573624081",
      },
      {
        outcome: "No",
        outcomeIndex: 1,
        assetId:
          "2468135709246813570924681357092468135709246813570924681357092468135709",
      },
    ],
  },
];
