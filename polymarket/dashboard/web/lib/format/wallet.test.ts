import { describe, expect, it } from "vitest";

import { truncateWallet } from "./wallet";

describe("truncateWallet", () => {
  it("truncates a full wallet address", () => {
    expect(truncateWallet("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234\u20265678",
    );
  });

  it("accepts a capitalized 0X prefix", () => {
    expect(truncateWallet("0XABCDEF1234567890", 3, 4)).toBe("0XABC\u20267890");
  });

  it("truncates an address at the exact minimum length", () => {
    expect(truncateWallet("0x1234a5678")).toBe("0x1234\u20265678");
  });

  it("throws when the address is shorter than leading plus trailing plus prefix and ellipsis", () => {
    expect(() => truncateWallet("0x12345678")).toThrow(
      "Wallet address must be at least 11 characters",
    );
  });

  it("throws when the address has no 0x prefix", () => {
    expect(() => truncateWallet("1234567890abcdef")).toThrow("Wallet address must start with 0x");
  });
});
