import {
  type BarSummary,
  type CocktailDetail,
  type DisplayUnit,
  formatAmount,
  hasRole,
  imageUrl,
} from "@larder/shared";
import { type UseMutationResult, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft, GitFork, Pencil } from "lucide-react";
import { Fragment, type JSX, type ReactElement, useState } from "react";
import { ApiError } from "@/api/client.ts";
import { type CocktailFilters, cocktailQuery } from "@/api/cocktails.ts";
import { useSetFavourite } from "@/api/feedback.ts";
import { utensilQuery } from "@/api/utensils.ts";
import { badge } from "@/components/badge.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { Combobox } from "@/components/combobox.tsx";
import { FavouriteButton } from "@/components/favourite-button.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { CocktailComments } from "./cocktail-comments.tsx";
import { CocktailRaters, RatingSummary } from "./cocktail-ratings.tsx";

const route = getRouteApi("/cocktails/$cocktailId");

export function CocktailDetailPage(): JSX.Element {
  const { cocktailId }: { cocktailId: string } = route.useParams();
  return (
    <BarGate title="Cocktail">
      {(bar: BarSummary): JSX.Element => (
        <CocktailView key={`${bar.id}/${cocktailId}`} bar={bar} id={cocktailId} />
      )}
    </BarGate>
  );
}

function CocktailView({ bar, id }: Readonly<{ bar: BarSummary; id: string }>): JSX.Element {
  const search: CocktailFilters = route.useSearch();
  const recipe = useQuery(cocktailQuery(bar.id, id));
  let content: ReactElement;
  if (recipe.isPending) {
    content = <LoadingState label="Loading cocktail…" />;
  } else if (recipe.isError) {
    content =
      recipe.error instanceof ApiError && recipe.error.code === "NOT_FOUND" ? (
        <EmptyState title="Cocktail not found" />
      ) : (
        <ErrorState
          error={recipe.error}
          onRetry={(): ReturnType<typeof recipe.refetch> => recipe.refetch()}
        />
      );
  } else {
    content = <CocktailRecipe barId={bar.id} recipe={recipe.data} />;
  }

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4">
      <nav
        aria-label="Cocktail actions"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <Link
          to="/cocktails"
          search={search}
          className="flex items-center gap-1 text-muted-foreground text-sm hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All cocktails
        </Link>
        {recipe.isSuccess && hasRole(bar.role, "editor") && (
          <div className="flex flex-wrap gap-1">
            <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
              <Link to="/cocktails/new" search={{ ...search, variantOf: id }}>
                <GitFork aria-hidden />
                Create variant
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
              <Link to="/cocktails/$cocktailId/edit" params={{ cocktailId: id }} search={search}>
                <Pencil aria-hidden />
                Edit cocktail
              </Link>
            </Button>
          </div>
        )}
      </nav>
      {content}
    </section>
  );
}

function CocktailRecipe({
  barId,
  recipe,
}: Readonly<{ barId: string; recipe: CocktailDetail }>): JSX.Element {
  const search: CocktailFilters = route.useSearch();
  const setFavourite: UseMutationResult<unknown, Error, { id: string; favourite: boolean }> =
    useSetFavourite(barId);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="wrap-anywhere text-3xl">{recipe.name}</h1>
          <FavouriteButton
            favourite={recipe.is_favourite}
            onToggle={(favourite: boolean): void =>
              setFavourite.mutate({ id: recipe.id, favourite })
            }
          />
        </div>
        <RatingSummary barId={barId} recipe={recipe} />
      </div>
      {recipe.variant_of && (
        <div className="grid gap-1 wrap-anywhere text-muted-foreground text-sm">
          <p>
            Variant of{" "}
            <Link
              to="/cocktails/$cocktailId"
              params={{ cocktailId: recipe.variant_of.id }}
              search={search}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {recipe.variant_of.name}
            </Link>
          </p>
          {recipe.variant_note && <p className="whitespace-pre-line">{recipe.variant_note}</p>}
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto] lg:gap-6 lg:has-[>img]:grid-rows-[auto_1fr]">
        {recipe.image_id && (
          <img
            src={imageUrl(recipe.image_id)}
            alt={recipe.name}
            className="mx-auto h-auto max-h-96 w-auto max-w-full rounded-xl shadow-sm lg:col-start-1 lg:row-start-1"
          />
        )}
        <div className="flex min-w-0 flex-col gap-4 wrap-anywhere lg:col-start-2 lg:row-span-full">
          <CocktailDetails barId={barId} recipe={recipe} />
        </div>
        <CocktailFacts barId={barId} recipe={recipe} />
      </div>
    </>
  );
}

function CocktailDetails({
  barId,
  recipe,
}: Readonly<{ barId: string; recipe: CocktailDetail }>): JSX.Element {
  const [servings, setServings] = useState<number>();
  const [unit, setUnit] = useState<DisplayUnit>("ml");
  // Bottles picked while pouring, by line. Only this view remembers them; the recipe stays generic.
  const [poured, setPoured] = useState<Record<string, string>>({});
  const count = servings ?? recipe.servings;
  const scaled = useQuery(
    cocktailQuery(barId, recipe.id, count === recipe.servings ? undefined : count),
  );
  const computed = scaled.isSuccess ? scaled.data.computed : null;
  const missingCount = (scaled.data ?? recipe).missing.length;
  let ingredients: ReactElement;
  if (scaled.isPending) {
    ingredients = <LoadingState label="Scaling recipe…" />;
  } else if (scaled.isError) {
    ingredients = (
      <ErrorState
        error={scaled.error}
        onRetry={(): ReturnType<typeof scaled.refetch> => scaled.refetch()}
      />
    );
  } else {
    ingredients = (
      <IngredientList
        recipe={scaled.data}
        unit={unit}
        poured={poured}
        onPour={(lineId: string, productId: string): void =>
          setPoured({ ...poured, [lineId]: productId })
        }
      />
    );
  }

  return (
    <>
      {recipe.description && <p className="whitespace-pre-line">{recipe.description}</p>}
      <section
        aria-labelledby="cocktail-ingredients"
        className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cocktail-ingredients" className="font-semibold text-lg">
            Ingredients
          </h2>
          <output className={missingCount === 0 ? badge({ tone: "brand" }) : "sr-only"}>
            {missingCount === 0 ? "Can make now" : `Missing ingredients: ${missingCount}`}
          </output>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3">
          <fieldset className="flex items-center gap-2" aria-label="Servings">
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Fewer servings"
              disabled={count === 1}
              onClick={(): void => setServings(count - 1)}
            >
              −
            </Button>
            <output className="text-sm tabular-nums" aria-live="polite">
              {count} {count === 1 ? "serving" : "servings"}
            </output>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="More servings"
              disabled={count === Number.MAX_SAFE_INTEGER}
              onClick={(): void => setServings(count + 1)}
            >
              +
            </Button>
          </fieldset>
          <fieldset className="flex gap-0.5 rounded-md border p-0.5" aria-label="Display units">
            {(["ml", "oz"] as const).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={unit === option ? "secondary" : "ghost"}
                aria-pressed={unit === option}
                onClick={(): void => setUnit(option)}
              >
                {option}
              </Button>
            ))}
          </fieldset>
          {computed && (
            <p className="text-muted-foreground text-sm tabular-nums">
              ≈ {Math.round(computed.abv)}% ABV ·{" "}
              {computed.volume_ml === null
                ? "Volume unavailable"
                : formatAmount(computed.volume_ml, "ml", unit)}
            </p>
          )}
        </div>

        {ingredients}
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
      <CocktailRaters recipe={recipe} />
      <CocktailComments barId={barId} cocktailId={recipe.id} />
    </>
  );
}

function CocktailFacts({
  barId,
  recipe,
}: Readonly<{ barId: string; recipe: CocktailDetail }>): JSX.Element {
  const search: CocktailFilters = route.useSearch();
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
    <div className="grid min-w-0 gap-4 lg:col-start-1">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border bg-card p-4 text-sm shadow-xs sm:p-5">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-line break-words">{value}</dd>
            </div>
          ))}
      </dl>
      {recipe.variants.length > 0 && (
        <section
          aria-labelledby="cocktail-variants"
          className="grid gap-2 rounded-xl border bg-card p-4 shadow-xs sm:p-5"
        >
          <h2 id="cocktail-variants" className="font-semibold text-lg">
            Variants
          </h2>
          <ul className="space-y-1 text-sm">
            {recipe.variants.map(({ id, name }) => (
              <li key={id} className="wrap-anywhere">
                <Link
                  to="/cocktails/$cocktailId"
                  params={{ cocktailId: id }}
                  search={search}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {glass.isError && (
        <ErrorState
          error={glass.error}
          onRetry={(): ReturnType<typeof glass.refetch> => glass.refetch()}
        />
      )}
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
}): JSX.Element {
  const missing = new Set(recipe.missing.map(({ id }) => id));
  return recipe.ingredients.length === 0 ? (
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
              <strong className="font-medium">{formatAmount(line.amount, line.unit, unit)}</strong>{" "}
              {sources.map((source, index) => (
                <Fragment key={source.id}>
                  {index > 0 && " or "}
                  {source.name}
                  {source.note && ` (${source.note})`}
                </Fragment>
              ))}
              {line.optional && " (optional)"}
              {missing.has(line.id) && (
                <span className={badge({ tone: "destructive", className: "ml-2" })}>Missing</span>
              )}
            </span>
            {bottles.length > 0 && (
              <Combobox
                aria-label={`Use this bottle for ${line.name}`}
                className="max-w-xs"
                value={poured[line.id]}
                onChange={(value: string): void => onPour(line.id, value)}
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
  );
}
