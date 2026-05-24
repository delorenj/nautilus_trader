export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(
  rng: () => number,
  min: number,
  max: number,
): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);

  if (upper < lower) {
    throw new Error("max must be greater than or equal to min");
  }

  return Math.floor(rng() * (upper - lower + 1)) + lower;
}

export function randomChoice<T>(rng: () => number, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error("cannot choose from an empty array");
  }

  return arr[randomInt(rng, 0, arr.length - 1)] as T;
}

export function randomHex(rng: () => number, length: number): string {
  if (length < 0 || !Number.isInteger(length)) {
    throw new Error("length must be a non-negative integer");
  }

  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += randomInt(rng, 0, 15).toString(16);
  }
  return value;
}

export function randomAddress(rng: () => number): string {
  return `0x${randomHex(rng, 40)}`;
}

export function randomConditionId(rng: () => number): string {
  return `0x${randomHex(rng, 64)}`;
}

export function randomAssetId(rng: () => number): string {
  let value = String(randomInt(rng, 1, 9));

  for (let index = 1; index < 70; index += 1) {
    value += String(randomInt(rng, 0, 9));
  }

  return value;
}

export function randomDecimal(
  rng: () => number,
  min: number,
  max: number,
  precision: number,
): string {
  if (max < min) {
    throw new Error("max must be greater than or equal to min");
  }

  if (precision < 0 || !Number.isInteger(precision)) {
    throw new Error("precision must be a non-negative integer");
  }

  return (min + rng() * (max - min)).toFixed(precision);
}
