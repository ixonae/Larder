import {
  type BarSummary,
  type CocktailDetail,
  type DisplayUnit,
  formatAmount,
  hasRole,
  imageUrl,
  type MissingIngredient,
} from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Fragment, useState } from "react";
import { ApiError } from "@/api/client.ts";
import { cocktailQuery } from "@/api/cocktails.ts";
import { utensilQuery } from "@/api/utensils.ts";
import { badge } from "@/components/badge.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { Combobox } from "@/components/combobox.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { missingLabel } from "./missing-label.ts";

const route = getRouteApi("/cocktails/$cocktailId");

export function CocktailDetailPage() {
  const { cocktailId } = route.useParams();
  const search = route.useSearch();
  return (
    <BarGate title="Cocktail">
      {(bar) => (
        <section className="mx-auto flex max-w-3xl flex-col gap-4">
          <Link
            to="/cocktails"
            search={search}
            className="flex items-center gap-1 text-muted-foreground text-sm hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All cocktails
          </Link>
          <CocktailView key={`${bar.id}/${cocktailId}`} bar={bar} id={cocktailId} />
        </section>
      )}
    </BarGate>
  );
}

function CocktailView({ bar, id }: { bar: BarSummary; id: string }) {
  const search = route.useSearch();
  const barId = bar.id;
  const recipe = useQuery(cocktailQuery(barId, id));
  if (recipe.isPending) return <LoadingState label="Loading cocktail…" />;
  if (recipe.isError) {
    if (recipe.error instanceof ApiError && recipe.error.code === "NOT_FOUND") {
      return <EmptyState title="Cocktail not found" />;
    }
    return <ErrorState error={recipe.error} onRetry={() => recipe.refetch()} />;
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl">{recipe.data.name}</h1>
        {hasRole(bar.role, "editor") && (
          <Button asChild variant="outline">
            <Link to="/cocktails/$cocktailId/edit" params={{ cocktailId: id }} search={search}>
              Edit cocktail
            </Link>
          </Button>
        )}
      </div>
      <CocktailDetails barId={barId} recipe={recipe.data} />
    </>
  );
}

function CocktailDetails({ barId, recipe }: { barId: string; recipe: CocktailDetail }) {
  const [servings, setServings] = useState<number>();
  const [unit, setUnit] = useState<DisplayUnit>("ml");
  // Bottles picked while pouring, by line. Only this view remembers them; the recipe stays generic.
  const [poured, setPoured] = useState<Record<string, string>>({});
  const count = servings ?? recipe.servings;
  const scaled = useQuery(
    cocktailQuery(barId, recipe.id, count === recipe.servings ? undefined : count),
  );
  const glass = useQuery({
    ...utensilQuery(barId, recipe.glass_id ?? ""),
    enabled: recipe.glass_id !== null,
  });
  const facts = [
    ["Method", recipe.method],
    ["Ice", recipe.ice.replaceAll("_", " ")],
    ["Glass", glass.data?.name],
    ["Serving notes", recipe.serving_notes],
    ["Tools", recipe.tools.map(({ name }) => name).join(", ")],
    ["Garnish", recipe.garnish],
    ["Tags", recipe.tags.map(({ name }) => name).join(", ")],
    ["Source", recipe.source],
    ["Notes", recipe.notes],
  ];

  return (
    <>
      {recipe.image_id && (
        <img
          src={imageUrl(recipe.image_id)}
          alt={recipe.name}
          className="max-h-80 w-full rounded-xl object-cover shadow-sm"
        />
      )}
      {recipe.description && <p className="whitespace-pre-line">{recipe.description}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex items-center gap-2" aria-label="Servings">
          <Button
            size="icon"
            variant="outline"
            aria-label="Fewer servings"
            disabled={count === 1}
            onClick={() => setServings(count - 1)}
          >
            −
          </Button>
          <output aria-live="polite">
            {count} {count === 1 ? "serving" : "servings"}
          </output>
          <Button
            size="icon"
            variant="outline"
            aria-label="More servings"
            disabled={count === Number.MAX_SAFE_INTEGER}
            onClick={() => setServings(count + 1)}
          >
            +
          </Button>
        </fieldset>
        <fieldset className="flex gap-1" aria-label="Display units">
          {(["ml", "oz"] as const).map((option) => (
            <Button
              key={option}
              variant={unit === option ? "default" : "outline"}
              aria-pressed={unit === option}
              onClick={() => setUnit(option)}
            >
              {option}
            </Button>
          ))}
        </fieldset>
      </div>

      <StockNotice missing={(scaled.data ?? recipe).missing} />
      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <h2 className="font-semibold text-lg">Ingredients</h2>
        {scaled.isPending ? (
          <LoadingState label="Scaling recipe…" />
        ) : scaled.isError ? (
          <ErrorState error={scaled.error} onRetry={() => scaled.refetch()} />
        ) : (
          <IngredientList
            recipe={scaled.data}
            unit={unit}
            poured={poured}
            onPour={(lineId, productId) => setPoured({ ...poured, [lineId]: productId })}
          />
        )}
      </section>

      {recipe.steps.length > 0 && (
        <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
          <h2 className="font-semibold text-lg">Steps</h2>
          <ol className="list-decimal space-y-2 pl-5">
            {recipe.steps.map((step) => (
              <li key={step.id} className="whitespace-pre-line">
                {step.text}
              </li>
            ))}
          </ol>
        </section>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border bg-card p-4 text-sm shadow-xs sm:p-5">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-line break-words">{value}</dd>
            </div>
          ))}
      </dl>
      {glass.isError && <ErrorState error={glass.error} onRetry={() => glass.refetch()} />}
    </>
  );
}

function StockNotice({ missing }: { missing: MissingIngredient[] }) {
  if (missing.length === 0) {
    return (
      <p role="status" className="rounded-xl bg-brand/10 px-4 py-3 text-brand text-sm">
        You can make this now.
      </p>
    );
  }
  return (
    <div role="status" className="rounded-xl bg-muted px-4 py-3 text-sm">
      <p className="font-medium">
        Missing {missing.length} {missing.length === 1 ? "ingredient" : "ingredients"}
      </p>
      <ul className="list-disc pl-5 text-muted-foreground">
        {missing.map((line) => (
          <li key={line.id}>{missingLabel(line)}</li>
        ))}
      </ul>
    </div>
  );
}

function IngredientList({
  recipe,
  unit,
  poured,
  onPour,
}: {
  recipe: CocktailDetail;
  unit: DisplayUnit;
  poured: Record<string, string>;
  onPour: (lineId: string, productId: string) => void;
}) {
  const { abv, volume_ml } = recipe.computed;
  const missing = new Set(recipe.missing.map(({ id }) => id));
  return (
    <>
      <p className="text-muted-foreground text-sm">
        ≈ {Math.round(abv)}% ABV ·{" "}
        {volume_ml === null ? "Volume unavailable" : formatAmount(volume_ml, "ml", unit)}
      </p>
      {recipe.ingredients.length === 0 ? (
        <p>No ingredients yet.</p>
      ) : (
        <ul className="space-y-2">
          {recipe.ingredients.map((line) => {
            const sources = [line, ...line.alternatives];
            // A bottle can match several sources (Gin, or London dry gin): list it once.
            const bottles = [
              ...new Map(
                sources.flatMap((source) => source.matching_bottles).map((b) => [b.id, b]),
              ).values(),
            ];
            return (
              <li key={line.id} className="grid gap-1">
                <span>
                  <strong className="font-medium">
                    {formatAmount(line.amount, line.unit, unit)}
                  </strong>{" "}
                  {sources.map((source, index) => (
                    <Fragment key={source.id}>
                      {index > 0 && " or "}
                      {source.name}
                      {source.note && ` (${source.note})`}
                    </Fragment>
                  ))}
                  {line.optional && " (optional)"}
                  {missing.has(line.id) && (
                    <span className={badge({ tone: "destructive", className: "ml-2" })}>
                      Missing
                    </span>
                  )}
                </span>
                {bottles.length > 0 && (
                  <Combobox
                    aria-label={`Use this bottle for ${line.name}`}
                    className="max-w-xs"
                    value={poured[line.id]}
                    onChange={(value) => onPour(line.id, value)}
                    options={bottles.map(({ id, name }) => ({ value: id, label: name }))}
                    clearLabel="Any bottle"
                    fallbackLabel="Bottle no longer in the bar"
                    searchPlaceholder="Search bottles"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
