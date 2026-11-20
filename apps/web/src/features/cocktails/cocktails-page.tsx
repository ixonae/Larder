import { type BarSummary, COCKTAIL_METHODS, type Cocktail, hasRole } from "@larder/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronRight, LayoutGrid, List, Martini } from "lucide-react";
import { categoryTreeQuery } from "@/api/categories.ts";
import { type CocktailFilters, cocktailListQuery, cocktailTagsQuery } from "@/api/cocktails.ts";
import { utensilOptionsQuery } from "@/api/utensils.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { Combobox, type ComboboxOption } from "@/components/combobox.tsx";
import { SearchInput } from "@/components/search-input.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { Button } from "@/components/ui/button.tsx";
import { categoryOptions } from "@/features/categories/category-options.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";
import { useStoredState } from "@/lib/stored-state.ts";

const route = getRouteApi("/cocktails");

const VIEWS = [
  { value: "grid", label: "Grid view", icon: LayoutGrid },
  { value: "list", label: "List view", icon: List },
] as const;
type View = (typeof VIEWS)[number]["value"];

export function CocktailsPage() {
  return <BarGate title="Cocktails">{(bar) => <CocktailsView key={bar.id} bar={bar} />}</BarGate>;
}

function CocktailsView({ bar }: { bar: BarSummary }) {
  const barId = bar.id;
  const search: CocktailFilters = route.useSearch();
  const navigate = route.useNavigate();
  const setFilter = (name: keyof CocktailFilters, value: string) =>
    navigate({
      to: "/cocktails",
      search: { ...search, [name]: value || undefined },
      replace: true,
    });
  const [q, setQ] = useDebouncedSearch(search.q ?? "", (value) => setFilter("q", value));
  const list = useInfiniteQuery(
    cocktailListQuery(barId, { ...search, q: search.q?.trim() || undefined }),
  );
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Object.values(search).some((value) => value?.trim());
  const [view, setView] = useStoredState(
    "larder.cocktails.view",
    VIEWS.map(({ value }) => value),
    "grid",
  );

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
      <FilterOptions barId={barId} search={search} setFilter={setFilter} />

      {list.isPending ? (
        <LoadingState label="Loading cocktails…" />
      ) : list.isLoadingError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={filtered ? "No cocktails match" : "No cocktails yet"} />
      ) : (
        <CocktailList items={items} search={search} view={view} />
      )}
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
    item: "",
    link: "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60",
  },
  grid: {
    list: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
    item: "min-w-0",
    link: "group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition hover:border-foreground/20 hover:shadow-md",
  },
} satisfies Record<View, { list: string; item: string; link: string }>;

function CocktailList({
  items,
  search,
  view,
}: {
  items: Cocktail[];
  search: CocktailFilters;
  view: View;
}) {
  const layout = LAYOUT[view];
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
        </li>
      ))}
    </ul>
  );
}

function CocktailRow({ cocktail }: { cocktail: Cocktail }) {
  return (
    <>
      <Thumbnail imageId={cocktail.image_id} icon={Martini} className="size-11" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium">{cocktail.name}</span>
          <span className="hidden shrink-0 text-muted-foreground text-xs capitalize sm:inline">
            {summary(cocktail)}
          </span>
        </div>
        <span className="truncate text-muted-foreground text-sm">{ingredientList(cocktail)}</span>
      </div>
      <AbvBadge abv={cocktail.computed.abv} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
}

function CocktailCard({ cocktail }: { cocktail: Cocktail }) {
  return (
    <>
      <Thumbnail
        imageId={cocktail.image_id}
        icon={Martini}
        className="aspect-[5/2] h-auto w-full rounded-none"
      />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="font-semibold leading-snug">{cocktail.name}</span>
          <AbvBadge abv={cocktail.computed.abv} />
        </div>
        <p className="line-clamp-2 text-muted-foreground text-sm">{ingredientList(cocktail)}</p>
        <span className="mt-auto pt-1 text-muted-foreground/80 text-xs capitalize">
          {summary(cocktail)}
        </span>
      </div>
    </>
  );
}

function AbvBadge({ abv }: { abv: number }) {
  return (
    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground text-xs tabular-nums">
      ≈ {Math.round(abv)}% ABV
    </span>
  );
}

function FilterOptions({
  barId,
  search,
  setFilter,
}: {
  barId: string;
  search: CocktailFilters;
  setFilter: (name: keyof CocktailFilters, value: string) => void;
}) {
  const categories = useQuery(categoryTreeQuery(barId));
  const glasses = useQuery(utensilOptionsQuery(barId, "glass"));
  const tags = useQuery(cocktailTagsQuery(barId));
  const failed = [categories, glasses, tags].find((query) => query.isError);
  const spirits = categoryOptions(categories.data ?? [], (item) => item.kind === "spirit");
  const named = (items: { id: string; name: string }[] = []) =>
    items.map(({ id, name }) => ({ value: id, label: name }));

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <FilterSelect
          label="Spirit"
          value={search.spirit}
          options={spirits}
          pending={categories.isPending}
          onChange={(value) => setFilter("spirit", value)}
        />
        <FilterSelect
          label="Tag"
          value={search.tag}
          options={named(tags.data)}
          pending={tags.isPending}
          onChange={(value) => setFilter("tag", value)}
        />
        <FilterSelect
          label="Glass"
          value={search.glass_id}
          options={named(glasses.data)}
          pending={glasses.isPending}
          onChange={(value) => setFilter("glass_id", value)}
        />
        <FilterSelect
          label="Method"
          value={search.method}
          options={COCKTAIL_METHODS.map((method) => ({ value: method, label: method }))}
          pending={false}
          onChange={(value) => setFilter("method", value)}
        />
      </div>
      {failed && <ErrorState error={failed.error} onRetry={() => failed.refetch()} />}
    </>
  );
}

function FilterSelect({
  label,
  value,
  options,
  pending,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: ComboboxOption[];
  pending: boolean;
  onChange: (value: string) => void;
}) {
  const name = label.toLowerCase();
  const plural = name === "glass" ? "glasses" : `${name}s`;
  return (
    <Combobox
      aria-label={label}
      value={value}
      onChange={onChange}
      options={options}
      clearLabel={`All ${plural}`}
      fallbackLabel={pending ? `Loading selected ${name}…` : `Unavailable ${name}`}
      searchPlaceholder={`Search ${plural}`}
    />
  );
}
