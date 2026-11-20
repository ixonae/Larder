import {
  ALCOHOL_KINDS,
  type BarSummary,
  COCKTAIL_METHODS,
  type Cocktail,
  type CocktailSort,
  hasRole,
  MIXER_KINDS,
  type MissingIngredient,
} from "@larder/shared";
import { type UseMutationResult, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowUpDown, ChevronRight, Heart, LayoutGrid, List, Martini } from "lucide-react";
import type { ChangeEvent, ReactElement } from "react";
import { categoryTreeQuery } from "@/api/categories.ts";
import { type CocktailFilters, cocktailListQuery, cocktailTagsQuery } from "@/api/cocktails.ts";
import { useSetFavourite } from "@/api/feedback.ts";
import { badge } from "@/components/badge.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import type { ChipOption } from "@/components/chip-radio-group.tsx";
import { ChoiceMenu } from "@/components/choice-menu.tsx";
import type { ComboboxOption } from "@/components/combobox.tsx";
import { MultiCombobox } from "@/components/multi-combobox.tsx";
import { SearchInput } from "@/components/search-input.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { toggleChip } from "@/components/toggle-chip.ts";
import { Button } from "@/components/ui/button.tsx";
import { categoryOptions } from "@/features/categories/category-options.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";
import { useStoredState } from "@/lib/stored-state.ts";
import { FavouriteButton } from "./favourite-button.tsx";
import { missingLabel } from "./missing-label.ts";

const route = getRouteApi("/cocktails");

const VIEWS = [
  { value: "grid", label: "Grid view", icon: LayoutGrid },
  { value: "list", label: "List view", icon: List },
] as const;
type View = (typeof VIEWS)[number]["value"];

export function CocktailsPage() {
  return <BarGate title="Cocktails">{(bar) => <CocktailsView key={bar.id} bar={bar} />}</BarGate>;
}

function CocktailsView({ bar }: Readonly<{ bar: BarSummary }>) {
  const barId = bar.id;
  const search: CocktailFilters = route.useSearch();
  const navigate = route.useNavigate();
  const setFilter = <K extends keyof CocktailFilters>(
    name: K,
    value: CocktailFilters[K] | undefined,
  ) =>
    navigate({
      to: "/cocktails",
      search: { ...search, [name]: value === "" ? undefined : value },
      replace: true,
    });
  const clearFilters = () =>
    navigate({ to: "/cocktails", search: { q: search.q, sort: search.sort }, replace: true });
  const [q, setQ] = useDebouncedSearch(search.q ?? "", (value) => setFilter("q", value));
  const list = useInfiniteQuery(
    cocktailListQuery(barId, { ...search, q: search.q?.trim() || undefined }),
  );
  const items: Cocktail[] = list.data?.pages.flatMap((page) => page.items) ?? [];
  // The router drops unset keys, so every value here is a chosen filter (or a blank search);
  // the sort order only reorders the list.
  const isSet = (skip: string[]) =>
    Object.entries(search).some(([key, value]) => !skip.includes(key) && String(value).trim());
  const filtered = isSet(["sort"]);
  const filtering = isSet(["sort", "q"]);
  const [view, setView] = useStoredState(
    "larder.cocktails.view",
    VIEWS.map(({ value }) => value),
    "grid",
  );

  let content: ReactElement;
  if (list.isPending) {
    content = <LoadingState label="Loading cocktails…" />;
  } else if (list.isLoadingError) {
    content = <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  } else if (items.length === 0) {
    content = <EmptyState title={filtered ? "No cocktails match" : "No cocktails yet"} />;
  } else {
    content = <CocktailList barId={barId} items={items} search={search} view={view} />;
  }

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl">Cocktails</h1>
        {hasRole(bar.role, "editor") && (
          <Button asChild>
            <Link to="/cocktails/new" search={search}>
              Add cocktail
            </Link>
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <SearchInput
          className="flex-1"
          maxLength={100}
          aria-label="Search cocktails"
          placeholder="Search cocktails"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <fieldset aria-label="Layout" className="flex shrink-0 rounded-md border p-0.5">
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              size="icon-sm"
              variant={view === value ? "secondary" : "ghost"}
              aria-label={label}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              <Icon />
            </Button>
          ))}
        </fieldset>
      </div>
      <FilterOptions
        barId={barId}
        search={search}
        setFilter={setFilter}
        onClear={filtering ? clearFilters : undefined}
      />

      {content}
      {list.isRefetchError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.isFetchNextPageError && (
        <p role="alert" className="text-destructive text-sm">
          {list.error.message}
        </p>
      )}
      {list.hasNextPage && (
        <Button
          variant="outline"
          disabled={list.isFetchingNextPage || list.isPlaceholderData}
          onClick={() => list.fetchNextPage()}
        >
          {list.isFetchNextPageError ? "Retry loading more" : "Load more"}
        </Button>
      )}
    </section>
  );
}

/** "Gin, Lime juice, Simple syrup": the preferred ingredients, as a quick read of the recipe. */
const ingredientList = (cocktail: Cocktail) => cocktail.computed.ingredients.join(", ");
/** "Shaken · Gin": how it is made and which spirits it is built on. */
const summary = (cocktail: Cocktail) =>
  [cocktail.method, ...cocktail.computed.spirits.map(({ name }) => name)].join(" · ");

const LAYOUT = {
  list: {
    list: "flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs",
    item: "relative",
    link: "flex items-center gap-3 py-2.5 pr-14 pl-3 transition-colors hover:bg-muted/60",
    heart: "absolute top-1/2 right-1 -translate-y-1/2",
  },
  grid: {
    list: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
    item: "relative min-w-0",
    link: "group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition hover:border-foreground/20 hover:shadow-md",
    heart: "absolute top-1 right-1 bg-background/80",
  },
} satisfies Record<View, { list: string; item: string; link: string; heart: string }>;

function CocktailList({
  barId,
  items,
  search,
  view,
}: Readonly<{
  barId: string;
  items: Cocktail[];
  search: CocktailFilters;
  view: View;
}>) {
  const layout = LAYOUT[view];
  const setFavourite: UseMutationResult<unknown, Error, { id: string; favourite: boolean }> =
    useSetFavourite(barId);
  return (
    <ul aria-label="Cocktails" className={layout.list}>
      {items.map((cocktail) => (
        <li key={cocktail.id} className={layout.item}>
          <Link
            to="/cocktails/$cocktailId"
            params={{ cocktailId: cocktail.id }}
            search={search}
            className={layout.link}
          >
            {view === "list" ? (
              <CocktailRow cocktail={cocktail} />
            ) : (
              <CocktailCard cocktail={cocktail} />
            )}
          </Link>
          <FavouriteButton
            favourite={cocktail.is_favourite}
            onToggle={(favourite: boolean): void =>
              setFavourite.mutate({ id: cocktail.id, favourite })
            }
            className={layout.heart}
          />
        </li>
      ))}
    </ul>
  );
}

function CocktailRow({ cocktail }: Readonly<{ cocktail: Cocktail }>) {
  return (
    <>
      <Thumbnail imageId={cocktail.image_id} icon={Martini} className="size-11" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium">{cocktail.name}</span>
          <span className="hidden shrink-0 text-muted-foreground text-xs capitalize sm:inline">
            {summary(cocktail)}
          </span>
          <RatingLine cocktail={cocktail} className="shrink-0 whitespace-nowrap" />
        </div>
        <span className="truncate text-muted-foreground text-sm">{ingredientList(cocktail)}</span>
        <MissingLine missing={cocktail.missing} />
      </div>
      <StockBadge missing={cocktail.missing} />
      <AbvBadge abv={cocktail.computed.abv} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
}

function CocktailCard({ cocktail }: Readonly<{ cocktail: Cocktail }>) {
  return (
    <>
      <Thumbnail
        imageId={cocktail.image_id}
        icon={Martini}
        className="aspect-[5/2] h-auto w-full rounded-none object-contain"
      />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="font-semibold leading-snug">{cocktail.name}</span>
          <AbvBadge abv={cocktail.computed.abv} />
        </div>
        <p className="line-clamp-2 text-muted-foreground text-sm">{ingredientList(cocktail)}</p>
        <MissingLine missing={cocktail.missing} />
        <RatingLine cocktail={cocktail} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-muted-foreground/80 text-xs capitalize">{summary(cocktail)}</span>
          <StockBadge missing={cocktail.missing} />
        </div>
      </div>
    </>
  );
}

/** "★ 4 · avg 4.2": your stars and the average; only the average if you have not rated it. */
function RatingLine({
  cocktail,
  className,
}: Readonly<{
  cocktail: Cocktail;
  className?: string;
}>): ReactElement | null {
  const parts: string[] = [];
  if (cocktail.my_rating) parts.push(`★ ${cocktail.my_rating.score}`);
  if (cocktail.avg_rating !== null) parts.push(`avg ${cocktail.avg_rating.toFixed(1)}`);
  if (parts.length === 0) return null;
  return (
    <span className={cn("text-muted-foreground text-xs tabular-nums", className)}>
      {parts.join(" · ")}
    </span>
  );
}

/** "Can make" or "Missing 2": whether the bar has every required ingredient right now. */
function StockBadge({ missing }: Readonly<{ missing: MissingIngredient[] }>) {
  const ready = missing.length === 0;
  return (
    <span className={badge({ tone: ready ? "brand" : "muted" })}>
      {ready ? "Can make" : `Missing ${missing.length}`}
    </span>
  );
}

function MissingLine({ missing }: Readonly<{ missing: MissingIngredient[] }>) {
  if (missing.length === 0) return null;
  return (
    <span className="truncate text-destructive text-xs">
      Missing: {missing.map(missingLabel).join(", ")}
    </span>
  );
}

/** The missing counts offered as chips; any other count still works from the URL. */
const AVAILABILITY: ChipOption<number | undefined>[] = [
  { value: undefined, label: "All" },
  { value: 0, label: "Can make now" },
  { value: 1, label: "Missing one" },
];

const SORTS: ChipOption<CocktailSort>[] = [
  { value: "name", label: "By name" },
  { value: "rating", label: "Top rated" },
];

function AbvBadge({ abv }: Readonly<{ abv: number }>) {
  return <span className={badge({ className: "tabular-nums" })}>≈ {Math.round(abv)}% ABV</span>;
}

function FilterOptions({
  barId,
  search,
  setFilter,
  onClear,
}: Readonly<{
  barId: string;
  search: CocktailFilters;
  setFilter: <K extends keyof CocktailFilters>(
    name: K,
    value: CocktailFilters[K] | undefined,
  ) => unknown;
  onClear: (() => unknown) | undefined;
}>) {
  const categories = useQuery(categoryTreeQuery(barId));
  const tags = useQuery(cocktailTagsQuery(barId));
  const failed = [categories, tags].find((query) => query.isError);
  const tree = categories.data ?? [];
  const named = (items: { id: string; name: string }[] = []) =>
    items.map(({ id, name }) => ({ value: id, label: name }));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Alcohol"
          noun="alcohol"
          values={search.alcohol}
          options={categoryOptions(tree, (item) => ALCOHOL_KINDS.has(item.kind))}
          pending={categories.isPending}
          onChange={(value) => setFilter("alcohol", value)}
        />
        <FilterSelect
          label="Mixers"
          noun="mixers"
          values={search.mixer}
          options={categoryOptions(tree, (item) => MIXER_KINDS.has(item.kind))}
          pending={categories.isPending}
          onChange={(value) => setFilter("mixer", value)}
        />
        <FilterSelect
          label="Tags"
          noun="tags"
          values={search.tag}
          options={named(tags.data)}
          pending={tags.isPending}
          onChange={(value) => setFilter("tag", value)}
        />
        <FilterSelect
          label="Method"
          noun="methods"
          values={search.method}
          options={COCKTAIL_METHODS.map((method) => ({ value: method, label: method }))}
          pending={false}
          onChange={(value) => setFilter("method", value)}
        />
        <ChoiceMenu<number | undefined>
          label="Availability"
          options={AVAILABILITY}
          value={search.missing}
          initial={undefined}
          onChange={(value) => setFilter("missing", value)}
        />
        <label className={toggleChip({ size: "sm" })}>
          <input
            type="checkbox"
            className="sr-only"
            checked={search.favourite === true}
            onChange={(event: ChangeEvent<HTMLInputElement>): unknown =>
              setFilter("favourite", event.currentTarget.checked ? true : undefined)
            }
          />
          <Heart className="size-3" aria-hidden />
          Favourites
        </label>
        <div className="ml-auto flex items-center gap-2">
          {onClear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onClear}
            >
              Clear filters
            </Button>
          )}
          <ChoiceMenu<CocktailSort>
            label="Sort"
            icon={ArrowUpDown}
            options={SORTS}
            value={search.sort ?? "name"}
            initial="name"
            onChange={(value: CocktailSort) =>
              setFilter("sort", value === "name" ? undefined : value)
            }
          />
        </div>
      </div>
      {failed && <ErrorState error={failed.error} onRetry={() => failed.refetch()} />}
    </>
  );
}

function FilterSelect<T extends string>({
  label,
  noun,
  values,
  options,
  pending,
  onChange,
}: Readonly<{
  label: string;
  noun: string;
  values: readonly T[] | undefined;
  options: ComboboxOption[];
  pending: boolean;
  onChange: (values: T[] | undefined) => unknown;
}>) {
  return (
    <MultiCombobox
      label={label}
      values={values ?? []}
      onChange={(next) => onChange(next.length > 0 ? (next as T[]) : undefined)}
      options={options}
      fallbackLabel={pending ? "Loading…" : "Unavailable"}
      searchPlaceholder={`Search ${noun}`}
    />
  );
}
