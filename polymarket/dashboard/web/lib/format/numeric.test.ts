import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  formatNotional,
  formatPercent,
  formatPrice,
  formatProbability,
  formatSize,
} from "./numeric";

describe("formatNotional", () => {
  it("formats standard notional values with the default pUSD unit", () => {
    expect(formatNotional("2500.00")).toBe("2,500.00 pUSD");
  });

  it("formats standard notional values with a custom unit or no unit", () => {
    expect(formatNotional("2500.00", { unit: "USD" })).toBe("2,500.00 USD");
    expect(formatNotional("2500.00", { unit: null })).toBe("2,500.00");
  });

  it("uses compact thresholds at thousands, millions, and billions", () => {
    expect(formatNotional("999.99", { compact: true })).toBe("999.99 pUSD");
    expect(formatNotional("1000", { compact: true })).toBe("1.00k pUSD");
    expect(formatNotional("2500.00", { compact: true })).toBe("2.50k pUSD");
    expect(formatNotional("12345678.9", { compact: true })).toBe("12.35M pUSD");
    expect(formatNotional("1250000000", { compact: true })).toBe("1.25B pUSD");
  });

  it("rounds with Decimal half-up behavior", () => {
    expect(formatNotional(new Decimal("2.345"), { unit: null })).toBe("2.35");
  });

  it("returns an em dash for nullish and empty values", () => {
    expect(formatNotional(null)).toBe("\u2014");
    expect(formatNotional(undefined)).toBe("\u2014");
    expect(formatNotional("")).toBe("\u2014");
  });
});

describe("formatProbability", () => {
  it("formats probability values as percentages", () => {
    expect(formatProbability("0.5")).toBe("50.0%");
    expect(formatProbability("0.0006")).toBe("0.1%");
    expect(formatProbability("0.624")).toBe("62.4%");
    expect(formatProbability("1.0")).toBe("100.0%");
  });

  it("clamps display at 100 percent", () => {
    expect(formatProbability("1.0009")).toBe("100.0%");
  });

  it("returns an em dash for nullish values", () => {
    expect(formatProbability(null)).toBe("\u2014");
  });
});

describe("formatPrice", () => {
  it("formats prices with default precision", () => {
    expect(formatPrice("0.62315")).toBe("0.6232");
  });

  it("honors the precision parameter and rounds half-up", () => {
    expect(formatPrice("1.005", 2)).toBe("1.01");
    expect(formatPrice("1.004", 2)).toBe("1.00");
  });
});

describe("formatSize", () => {
  it("formats sizes with separators and decimal-safe rounding", () => {
    expect(formatSize("12500.5")).toBe("12,500.50");
    expect(formatSize("12500.555", 2)).toBe("12,500.56");
  });
});

describe("formatPercent", () => {
  it("formats unsigned percentages", () => {
    expect(formatPercent("0.05")).toBe("5.00%");
  });

  it("adds a signed prefix for positive, negative, and zero values", () => {
    expect(formatPercent("0.0856", { signed: true })).toBe("+8.56%");
    expect(formatPercent("-0.0234", { signed: true })).toBe("-2.34%");
    expect(formatPercent("0", { signed: true })).toBe("+0.00%");
  });

  it("honors precision and clamps display at 100 percent", () => {
    expect(formatPercent("0.12345", { precision: 1 })).toBe("12.3%");
    expect(formatPercent("1.0009", { signed: true })).toBe("+100.00%");
  });
});
