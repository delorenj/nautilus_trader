const HORIZONTAL_ELLIPSIS = "\u2026";

export function truncateWallet(address: string, leading = 4, trailing = 4): string {
  if (!/^0x/i.test(address)) {
    throw new Error("Wallet address must start with 0x");
  }

  const minimumLength = leading + trailing + 3;

  if (address.length < minimumLength) {
    throw new Error(`Wallet address must be at least ${minimumLength} characters`);
  }

  return `${address.slice(0, 2 + leading)}${HORIZONTAL_ELLIPSIS}${address.slice(-trailing)}`;
}
