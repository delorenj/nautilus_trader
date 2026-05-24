function padTimePart(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatTimestampShort(epochSeconds: number): string {
  const timestamp = new Date(epochSeconds * 1000);

  return [
    padTimePart(timestamp.getHours()),
    padTimePart(timestamp.getMinutes()),
    padTimePart(timestamp.getSeconds()),
  ].join(":");
}

export function formatTimestampRelative(
  epochSeconds: number,
  now = Date.now() / 1000,
): string {
  const secondsElapsed = Math.floor(now - epochSeconds);

  if (secondsElapsed <= 0) {
    return "just now";
  }

  if (secondsElapsed < 60) {
    return `${secondsElapsed}s ago`;
  }

  if (secondsElapsed < 3600) {
    return `${Math.floor(secondsElapsed / 60)}m ago`;
  }

  if (secondsElapsed < 86400) {
    return `${Math.floor(secondsElapsed / 3600)}h ago`;
  }

  return `${Math.floor(secondsElapsed / 86400)}d ago`;
}
