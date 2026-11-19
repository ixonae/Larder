import { type BarSummary, COCKTAIL_METHODS, flattenTree, hasRole } from "@larder/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { categoryTreeQuery } from "@/api/categories.ts";
import { type CocktailFilters, cocktailListQuery, cocktailTagsQuery } from "@/api/cocktails.ts";
import { utensilOptionsQuery } from "@/api/utensils.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { NativeSelect } from "@/components/native-select.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";

const route = getRouteApi("/cocktails");

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

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-semibold text-2xl">Cocktails</h1>
        {hasRole(bar.role, "editor") && (
          <Button asChild>
            <Link to="/cocktails/new" search={search}>
              Add cocktail
            </Link>
          </Button>
        )}
      </div>
      <Input
        type="search"
        maxLength={100}
        aria-label="Search cocktails"
        placeholder="Search cocktails"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <FilterOptions barId={barId} search={search} setFilter={setFilter} />

      {list.isPending ? (
        <LoadingState label="Loading cocktails…" />
      ) : list.isLoadingError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={filtered ? "No cocktails match" : "No cocktails yet"} />
      ) : (
        <ul aria-label="Cocktails" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((cocktail) => (
            <li key={cocktail.id} className="min-w-0">
              <Link
                to="/cocktails/$cocktailId"
                params={{ cocktailId: cocktail.id }}
                search={search}
                className="flex h-full flex-col overflow-hidden rounded-lg border hover:bg-muted/50"
              >
                <Thumbnail
                  imageId={cocktail.image_id}
                  className="aspect-[2/1] h-auto w-full rounded-none"
                />
                <div className="grid gap-1 p-3">
                  <span className="font-medium">{cocktail.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {[
                      ...cocktail.computed.spirits.map(({ name }) => name),
                      `≈ ${Math.round(cocktail.computed.abv)}% ABV`,
                    ].join(" · ")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
  const spirits = flattenTree(categories.data ?? []).flatMap(({ item, depth }) =>
    item.kind === "spirit" ? [{ id: item.id, name: `${"  ".repeat(depth)}${item.name}` }] : [],
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 [&>select]:min-w-0">
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
          options={tags.data ?? []}
          pending={tags.isPending}
          onChange={(value) => setFilter("tag", value)}
        />
        <FilterSelect
          label="Glass"
          value={search.glass_id}
          options={glasses.data ?? []}
          pending={glasses.isPending}
          onChange={(value) => setFilter("glass_id", value)}
        />
        <NativeSelect
          aria-label="Method"
          value={search.method ?? ""}
          onChange={(event) => setFilter("method", event.target.value)}
        >
          <option value="">All methods</option>
          {COCKTAIL_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </NativeSelect>
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
  options: { id: string; name: string }[];
  pending: boolean;
  onChange: (value: string) => void;
}) {
  const name = label.toLowerCase();
  return (
    <NativeSelect
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">All {name === "glass" ? "glasses" : `${name}s`}</option>
      {value && !options.some(({ id }) => id === value) && (
        <option value={value}>
          {pending ? `Loading selected ${name}…` : `Unavailable ${name}`}
        </option>
      )}
      {options.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </NativeSelect>
  );
}
