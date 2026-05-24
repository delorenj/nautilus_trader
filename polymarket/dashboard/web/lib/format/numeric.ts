import Decimal from "decimal.js";

const EMPTY = "\u2014";

type DecimalInput = Decimal | string | number | null | undefined;

export type FormatNotionalOptions = {
  compact?: boolean;
  unit?: "pUSD" | "USD" | null;
  precision?: number;
};

export type FormatPercentOptions = {
  signed?: boolean;
  precision?: number;
};

function isEmptyValue(value: DecimalInput): value is null | undefined | "" {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function toDecimal(value: DecimalInput): Decimal | null {
  if (isEmptyValue(value)) {
    return null;
  }

  return value instanceof Decimal ? value : new Decimal(value);
}

function normalizeFixedZero(fixed: string, precision: number): string {
  const rounded = new Decimal(fixed);

  if (!rounded.isZero()) {
    return fixed;
  }

  return new Decimal(0).toFixed(precision);
}

function formatFixed(value: Decimal, precision: number): string {
  return normalizeFixedZero(value.toFixed(precision, Decimal.ROUND_HALF_UP), precision);
}

function formatThousands(value: Decimal, precision: number): string {
  const fixed = formatFixed(value, precision);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(Number(fixed));
}

function appendUnit(value: string, unit: "pUSD" | "USD" | null | undefined): string {
  if (unit === null) {
    return value;
  }

  return `${value} ${unit ?? "pUSD"}`;
}

function compactTier(value: Decimal): { divisor: Decimal; suffix: string } | null {
  const absolute = value.abs();

  if (absolute.greaterThanOrEqualTo("1000000000")) {
    return { divisor: new Decimal("1000000000"), suffix: "B" };
  }

  if (absolute.greaterThanOrEqualTo("1000000")) {
    return { divisor: new Decimal("1000000"), suffix: "M" };
  }

  if (absolute.greaterThanOrEqualTo("1000")) {
    return { divisor: new Decimal("1000"), suffix: "k" };
  }

  return null;
}

function clampPercentSource(value: Decimal): Decimal {
  return Decimal.min(value, new Decimal(1));
}

export function formatNotional(
  value: DecimalInput,
  opts: FormatNotionalOptions = {},
): string {
  const decimal = toDecimal(value);

  if (decimal === null) {
    return EMPTY;
  }

  const precision = opts.precision ?? 2;

  if (opts.compact) {
    const tier = compactTier(decimal);

    if (tier !== null) {
      return appendUnit(`${formatFixed(decimal.dividedBy(tier.divisor), precision)}${tier.suffix}`, opts.unit);
    }
  }

  return appendUnit(formatThousands(decimal, precision), opts.unit);
}

export function formatProbability(value: DecimalInput): string {
  const decimal = toDecimal(value);

  if (decimal === null) {
    return EMPTY;
  }

  return `${formatFixed(clampPercentSource(decimal).times(100), 1)}%`;
}

export function formatPrice(value: DecimalInput, precision = 4): string {
  const decimal = toDecimal(value);

  if (decimal === null) {
    return EMPTY;
  }

  return formatFixed(decimal, precision);
}

export function formatSize(value: DecimalInput, precision = 2): string {
  const decimal = toDecimal(value);

  if (decimal === null) {
    return EMPTY;
  }

  return formatThousands(decimal, precision);
}

export function formatPercent(
  value: DecimalInput,
  opts: FormatPercentOptions = {},
): string {
  const decimal = toDecimal(value);

  if (decimal === null) {
    return EMPTY;
  }

  const precision = opts.precision ?? 2;
  const fixed = formatFixed(clampPercentSource(decimal).times(100), precision);
  const rounded = new Decimal(fixed);

  if (!opts.signed) {
    return `${fixed}%`;
  }

  if (rounded.isNegative()) {
    return `${fixed}%`;
  }

  return `+${fixed}%`;
}
