import type { Category } from "./categories.ts";
import type { CocktailMethod, ComputedCocktail } from "./cocktails.ts";
import { scale, toMl, type Unit } from "./units.ts";

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

function measuredVolume(line: VolumeLine, includeOptional: boolean): number {
  return line.optional && !includeOptional ? 0 : (toMl(line.amount, line.unit) ?? 0);
}

/** Measured volume before dilution. */
export function computeVolume(lines: readonly VolumeLine[], includeOptional = false): number {
  return lines.reduce((total, line) => total + measuredVolume(line, includeOptional), 0);
}

/** ABV in percent. Each line carries its resolved ABV for the preferred source. */
export function computeAbv(
  lines: readonly (VolumeLine & { abv: number })[],
  method: CocktailMethod,
  includeOptional = false,
): number {
  const volume = computeVolume(lines, includeOptional);
  if (volume === 0) return 0;
  const weighted = lines.reduce(
    (total, line) => total + (measuredVolume(line, includeOptional) / volume) * line.abv,
    0,
  );
  return Math.min(100, weighted / (1 + dilution[method]));
}

/** Distinct spirit families in preferred ingredient order. Paths run from root to leaf. */
export function spiritsContained(lines: readonly SpiritLine[]): ComputedCocktail["spirits"] {
  const spirits = new Map<string, { id: string; name: string }>();
  for (const { category_path: path } of lines) {
    const [root, family] = path.filter(({ kind }) => kind === "spirit");
    if (!root || path.at(-1)?.kind !== "spirit") continue;
    const { id, name } = family ?? root;
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
