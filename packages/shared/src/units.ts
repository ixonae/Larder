import { z } from "zod";

export const UNITS = [
  "ml",
  "cl",
  "oz",
  "tsp",
  "barspoon",
  "tbsp",
  "dash",
  "drop",
  "splash",
  "piece",
  "slice",
  "wedge",
  "sprig",
  "leaf",
  "top",
  "to_taste",
] as const;

export const unitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof unitSchema>;

/** Units the user can pick as their display unit. */
export const DISPLAY_UNITS = ["ml", "cl", "oz"] as const;
export const displayUnitSchema = z.enum(DISPLAY_UNITS);
export type DisplayUnit = z.infer<typeof displayUnitSchema>;

export type UnitType = "volume" | "count" | "none";

export interface UnitInfo {
  type: UnitType;
  /** Millilitres in one unit (volume units only). */
  ml: number | null;
  /**
   * Whether an amount in this unit is converted to the display unit.
   * Small measures (dashes, barspoons…) keep their unit: "2 dashes" reads better than "1.8 ml".
   */
  converts: boolean;
  singular: string;
  plural: string;
}

const volume = (ml: number, converts: boolean, singular: string, plural = singular): UnitInfo => ({
  type: "volume",
  ml,
  converts,
  singular,
  plural,
});
const count = (singular: string, plural: string): UnitInfo => ({
  type: "count",
  ml: null,
  converts: false,
  singular,
  plural,
});
const none = (label: string): UnitInfo => ({
  type: "none",
  ml: null,
  converts: false,
  singular: label,
  plural: label,
});

/** Exact US fluid ounce. */
export const ML_PER_OZ = 29.5735;

export const UNIT_INFO: Record<Unit, UnitInfo> = {
  ml: volume(1, true, "ml"),
  cl: volume(10, true, "cl"),
  oz: volume(ML_PER_OZ, true, "oz"),
  tsp: volume(5, false, "tsp"),
  barspoon: volume(5, false, "barspoon", "barspoons"),
  tbsp: volume(15, false, "tbsp"),
  dash: volume(0.9, false, "dash", "dashes"),
  drop: volume(0.05, false, "drop", "drops"),
  splash: volume(5, false, "splash", "splashes"),
  piece: count("piece", "pieces"),
  slice: count("slice", "slices"),
  wedge: count("wedge", "wedges"),
  sprig: count("sprig", "sprigs"),
  leaf: count("leaf", "leaves"),
  top: none("Top"),
  to_taste: none("To taste"),
};

/** Whether a line in this unit needs an amount (`top` and `to_taste` do not). */
export function unitNeedsAmount(unit: Unit): boolean {
  return UNIT_INFO[unit].type !== "none";
}

/** Amount in millilitres, or null when the unit is not a volume or there is no amount. */
export function toMl(amount: number | null, unit: Unit): number | null {
  const factor = UNIT_INFO[unit].ml;
  if (amount === null || factor === null) return null;
  return amount * factor;
}

/** Converts a volume amount between two volume units. Throws for non-volume units. */
export function convert(amount: number, from: Unit, to: Unit): number {
  const fromMl = UNIT_INFO[from].ml;
  const toMlFactor = UNIT_INFO[to].ml;
  if (fromMl === null || toMlFactor === null) {
    throw new RangeError(`convert: cannot convert ${from} to ${to}`);
  }
  return (amount * fromMl) / toMlFactor;
}

/** Removes floating-point noise such as 2.0000000000000004. */
const clean = (n: number): number => Math.round(n * 1e9) / 1e9;

/** Multiplies an amount by `factor`; count units are rounded up (you cannot use 1.5 wedges). */
export function scale(amount: number | null, unit: Unit, factor: number): number | null {
  if (amount === null) return null;
  const scaled = clean(amount * factor);
  return UNIT_INFO[unit].type === "count" ? Math.ceil(scaled) : scaled;
}

const FRACTIONS = ["", "¼", "½", "¾"] as const;

/** `1.5` → `1 ½`, `0.25` → `¼`, `2` → `2`. Input must be a multiple of 0.25. */
function quarters(n: number): string {
  const whole = Math.floor(n);
  const frac = FRACTIONS[Math.round((n - whole) * 4)];
  if (whole === 0) return frac || "0";
  return frac ? `${whole} ${frac}` : String(whole);
}

/** Rounds to one decimal at most: `22.5`, `45`, `7.4`. */
const oneDecimal = (n: number): string => String(Math.round(n * 10) / 10);

function formatNumber(n: number, unit: Unit): string {
  if (unit === "ml" || unit === "cl") return oneDecimal(n);
  if (unit === "oz") {
    const rounded = Math.round(n * 4) / 4;
    return rounded === 0 && n > 0 ? "< ¼" : quarters(rounded);
  }
  const isQuarter = Number.isInteger(clean(n * 4));
  return isQuarter ? quarters(clean(n)) : String(Math.round(n * 100) / 100);
}

/**
 * Formats an ingredient amount for display, e.g. `1 ½ oz`, `22.5 ml`, `2 dashes`, `Top`.
 * Measured volumes (ml, cl, oz) are converted to `displayUnit` when given; other units are shown as entered.
 */
export function formatAmount(amount: number | null, unit: Unit, displayUnit?: DisplayUnit): string {
  const info = UNIT_INFO[unit];
  if (info.type === "none") return info.singular;
  if (amount === null) return info.singular;

  if (info.converts && displayUnit !== undefined) {
    const converted = convert(amount, unit, displayUnit);
    return `${formatNumber(converted, displayUnit)} ${displayUnit}`;
  }

  const label = amount > 0 && amount <= 1 ? info.singular : info.plural;
  return `${formatNumber(amount, unit)} ${label}`;
}
