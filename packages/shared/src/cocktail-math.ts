import type { Category } from "./categories.ts";
import type { CocktailMethod, ComputedCocktail } from "./cocktails.ts";
import { scale, toMl, UNIT_INFO, type Unit } from "./units.ts";

type Quantity = { amount: number | null; unit: Unit };
type VolumeLine = Quantity & { optional: boolean };
type SpiritLine = { category_path: readonly Pick<Category, "id" | "name" | "kind">[] };

const dilution: Record<CocktailMethod, number> = {
  shaken: 0.25,
  stirred: 0.2,
  thrown: 0.15,
  blended: 0.3,
  built: 0.1,
  other: 0,
};

function includedAmount(line: VolumeLine, includeOptional: boolean): number {
  return line.optional && !includeOptional ? 0 : (line.amount ?? 0);
}

/** Measured volume before dilution, or null if the total overflows. */
export function computeVolume(
  lines: readonly VolumeLine[],
  includeOptional = false,
): number | null {
  const total = lines.reduce(
    (sum, line) => sum + (toMl(includedAmount(line, includeOptional), line.unit) ?? 0),
    0,
  );
  return Number.isFinite(total) ? total : null;
}

/** ABV in percent. Each line carries its resolved ABV for the preferred source. */
export function computeAbv(
  lines: readonly (VolumeLine & { abv: number })[],
  method: CocktailMethod,
  includeOptional = false,
): number {
  // Normalize before converting to ml so very large or small quantities still yield an ABV.
  const largest = lines.reduce(
    (max, line) =>
      UNIT_INFO[line.unit].type === "volume"
        ? Math.max(max, includedAmount(line, includeOptional))
        : max,
    0,
  );
  if (largest === 0) return 0;

  let volume = 0;
  let weighted = 0;
  for (const line of lines) {
    const ml = toMl(includedAmount(line, includeOptional) / largest, line.unit) ?? 0;
    volume += ml;
    weighted += ml * line.abv;
  }
  return Math.min(100, weighted / volume / (1 + dilution[method]));
}

/** Distinct spirit families in preferred ingredient order. Paths run from root to leaf. */
export function spiritsContained(lines: readonly SpiritLine[]): ComputedCocktail["spirits"] {
  const spirits = new Map<string, { id: string; name: string }>();
  for (const { category_path: path } of lines) {
    const leaf = path.at(-1);
    if (leaf?.kind !== "spirit") continue;
    const root = path.findIndex(({ kind }) => kind === "spirit");
    const { id, name } = path[root + 1] ?? leaf;
    spirits.set(id, { id, name });
  }
  return [...spirits.values()];
}

export function scaleRecipe<T extends Quantity>(
  lines: readonly T[],
  recipeServings: number,
  servings: number,
): (Omit<T, "amount"> & Pick<Quantity, "amount">)[] {
  return lines.map((line) => ({
    ...line,
    amount: scale(line.amount, line.unit, servings / recipeServings),
  }));
}
