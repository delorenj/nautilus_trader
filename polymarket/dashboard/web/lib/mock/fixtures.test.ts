import { describe, expect, it } from "vitest";

import {
  MARKET_FIXTURES,
  MARKET_TITLES,
  STABLE_WALLET_COUNT,
  WALLET_PSEUDONYMS,
} from "./fixtures";

describe("mock fixtures", () => {
  it("keeps every title backed by one market fixture", () => {
    expect(MARKET_FIXTURES.map((market) => market.title)).toEqual(
      MARKET_TITLES,
    );
  });

  it("uses stable wallet defaults within the pseudonym pool", () => {
    expect(STABLE_WALLET_COUNT).toBe(5);
    expect(WALLET_PSEUDONYMS).toHaveLength(8);
    expect(STABLE_WALLET_COUNT).toBeLessThanOrEqual(WALLET_PSEUDONYMS.length);
  });

  it("keeps condition and asset identifiers unique and schema-shaped", () => {
    const conditionIds = MARKET_FIXTURES.map((market) => market.conditionId);
    const assetIds = MARKET_FIXTURES.flatMap((market) =>
      market.outcomes.map((outcome) => outcome.assetId),
    );

    expect(new Set(conditionIds).size).toBe(conditionIds.length);
    expect(new Set(assetIds).size).toBe(assetIds.length);

    for (const conditionId of conditionIds) {
      expect(conditionId).toMatch(/^0x[0-9a-f]{64}$/);
    }

    for (const assetId of assetIds) {
      expect(assetId).toMatch(/^\d{70}$/);
    }
  });
});
