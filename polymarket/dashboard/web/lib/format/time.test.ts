import { describe, expect, it } from "vitest";

import { formatTimestampRelative, formatTimestampShort } from "./time";

describe("formatTimestampShort", () => {
  it("formats local time as zero-padded hh:mm:ss", () => {
    const epochSeconds = 1_700_000_000;
    const expected = new Date(epochSeconds * 1000)
      .toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      .replace(/^24:/, "00:");

    expect(formatTimestampShort(epochSeconds)).toBe(expected);
  });
});

describe("formatTimestampRelative", () => {
  it("formats seconds ago", () => {
    expect(formatTimestampRelative(988, 1000)).toBe("12s ago");
  });

  it("formats minutes ago", () => {
    expect(formatTimestampRelative(880, 1000)).toBe("2m ago");
  });

  it("formats hours ago", () => {
    expect(formatTimestampRelative(1000, 8200)).toBe("2h ago");
  });

  it("formats days ago", () => {
    expect(formatTimestampRelative(1000, 260200)).toBe("3d ago");
  });

  it("formats future timestamps as just now", () => {
    expect(formatTimestampRelative(1001, 1000)).toBe("just now");
  });
});
