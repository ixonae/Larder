import {
  type BarSummary,
  hasRole,
  idSchema,
  type Product,
  TASTING_SCORE_MAX,
  TASTING_SCORE_MIN,
  type Tasting,
  type Visibility,
  visibilitySchema,
} from "@larder/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { NotebookPen, Plus, SlidersHorizontal, X } from "lucide-react";
import { type ChangeEvent, type JSX, type ReactNode, useState } from "react";
import { z } from "zod";
import { categoryTreeQuery } from "@/api/categories.ts";
import { productQuery } from "@/api/products.ts";
import { useMe } from "@/api/queries.ts";
import { tastingListQuery } from "@/api/tastings.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { Combobox } from "@/components/combobox.tsx";
import { FeedbackVisibilityFilter } from "@/components/feedback-visibility.tsx";
import { RatingStars } from "@/components/rating-stars.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { toggleChip } from "@/components/toggle-chip.ts";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { BottlesTabs } from "@/features/bottles/bottles-tabs.tsx";
import { bottleCategoryOptions } from "@/features/categories/category-options.tsx";
import { trueOnlyFlag } from "@/lib/search-params.ts";
import { BottlePicker, bottleLabel } from "./bottle-picker.tsx";
import { TastingEntry } from "./tasting-entry.tsx";
import { TastingSheet, type TastingTarget } from "./tasting-sheet.tsx";

/** Journal filters live in the URL ("See all" on a bottle links here); bad values are dropped. */
export const tastingsSearchSchema = z.object({
  category: idSchema.optional().catch(undefined),
  /** Minimum score. */
  score: z.number().int().min(TASTING_SCORE_MIN).max(TASTING_SCORE_MAX).optional().catch(undefined),
  mine: trueOnlyFlag,
  product: idSchema.optional().catch(undefined),
  visibility: visibilitySchema.optional().catch(undefined),
});
type TastingsSearch = z.infer<typeof tastingsSearchSchema>;

const route = getRouteApi("/tastings");

export function TastingsPage(): JSX.Element {
  return (
    <BarGate title="Tastings">
      {(bar: BarSummary): JSX.Element => <TastingsView key={bar.id} bar={bar} />}
    </BarGate>
  );
}

const monthFormat = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Consecutive entries of the same month, newest month first (the list already is newest first). */
function byMonth(items: Tasting[]): [string, Tasting[]][] {
  const months = new Map<string, Tasting[]>();
  for (const item of items) {
    const month = monthFormat.format(new Date(`${item.tasted_on.slice(0, 7)}-01`));
    const entries = months.get(month);
    if (entries) entries.push(item);
    else months.set(month, [item]);
  }
  return [...months];
}

function TastingsView({ bar }: Readonly<{ bar: BarSummary }>): JSX.Element {
  const canEdit = hasRole(bar.role, "editor");
  const userId = useMe().data?.user.id;
  const search: TastingsSearch = route.useSearch();
  const navigate = route.useNavigate();
  const setSearch = (patch: Partial<TastingsSearch>): Promise<void> =>
    navigate({ to: "/tastings", search: { ...search, ...patch }, replace: true });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [target, setTarget] = useState<TastingTarget>(null);
  const list = useInfiniteQuery(
    tastingListQuery(bar.id, {
      category_id: search.category,
      product_id: search.product,
      score_min: search.score,
      mine: search.mine,
      visibility: search.visibility,
    }),
  );
  const bottle = useQuery({
    ...productQuery(bar.id, search.product ?? ""),
    enabled: search.product !== undefined,
  });
  const selectedBottleLabel = bottle.data ? bottleLabel(bottle.data) : "One bottle";
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const activeFilters = [
    search.category,
    search.product,
    search.score,
    search.mine,
    search.visibility,
  ].filter(Boolean).length;

  let content: ReactNode;
  if (list.isPending) content = <LoadingState label="Loading tastings…" />;
  // A failed "Load more" keeps the loaded entries; the error shows by the button instead.
  else if (list.isError && items.length === 0) {
    content = (
      <ErrorState
        error={list.error}
        onRetry={(): ReturnType<typeof list.refetch> => list.refetch()}
      />
    );
  } else if (items.length === 0) {
    content =
      activeFilters > 0 ? (
        <EmptyState title="No tastings match">Try other filters.</EmptyState>
      ) : (
        <EmptyState title="No tastings yet">Note what you taste and how you liked it.</EmptyState>
      );
  } else {
    content = (
      <>
        {byMonth(items).map(([month, entries]) => (
          <section key={month} aria-label={month} className="grid gap-2">
            <h2 className="font-semibold text-muted-foreground text-sm">{month}</h2>
            <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {entries.map((tasting) => (
                <TastingEntry
                  key={tasting.id}
                  barId={bar.id}
                  tasting={tasting}
                  mine={canEdit && tasting.author.id === userId}
                  onEdit={(edited: Tasting): void => setTarget({ kind: "edit", tasting: edited })}
                />
              ))}
            </ul>
          </section>
        ))}
        {list.hasNextPage && (
          <Button
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={(): ReturnType<typeof list.fetchNextPage> => list.fetchNextPage()}
          >
            Load more
          </Button>
        )}
        {list.isFetchNextPageError && (
          <p role="alert" className="text-destructive text-sm">
            Could not load more tastings. Try again.
          </p>
        )}
      </>
    );
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <BottlesTabs />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl">Tastings</h1>
        <Button variant="outline" onClick={(): void => setFiltersOpen(true)}>
          <SlidersHorizontal aria-hidden />
          {activeFilters > 0 ? `Filters (${activeFilters})` : "Filters"}
        </Button>
      </div>
      {search.product && (
        <div className="flex">
          <span className="flex items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 text-sm">
            {selectedBottleLabel}
            <button
              type="button"
              aria-label="Show every bottle"
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(): Promise<void> => setSearch({ product: undefined })}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        </div>
      )}
      {content}

      {canEdit && (
        <Button
          size="lg"
          className="fixed right-4 bottom-20 z-10 rounded-full shadow-lg md:right-8 md:bottom-8"
          onClick={(): void =>
            setTarget({
              kind: "new",
              ...(bottle.data && {
                bottle: { id: bottle.data.id, name: bottle.data.name, status: bottle.data.status },
              }),
            })
          }
        >
          <Plus aria-hidden />
          Add tasting
        </Button>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Filter tastings</SheetTitle>
            <SheetDescription>Narrow the journal down.</SheetDescription>
          </SheetHeader>
          <TastingFilters
            barId={bar.id}
            search={search}
            selectedBottleLabel={selectedBottleLabel}
            onChange={setSearch}
          />
        </SheetContent>
      </Sheet>
      <TastingSheet barId={bar.id} target={target} onClose={(): void => setTarget(null)} />
    </section>
  );
}

function TastingFilters({
  barId,
  search,
  selectedBottleLabel,
  onChange,
}: Readonly<{
  barId: string;
  search: TastingsSearch;
  selectedBottleLabel: string;
  onChange: (patch: Partial<TastingsSearch>) => void;
}>): JSX.Element {
  const tree = useQuery(categoryTreeQuery(barId));
  return (
    <div className="grid gap-5 px-4 pb-4">
      <BottlePicker
        barId={barId}
        value={search.product}
        fallbackLabel={selectedBottleLabel}
        clearLabel="All bottles"
        onChange={(bottle: Product | null): void => onChange({ product: bottle?.id })}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="tasting-category">Category</Label>
        <Combobox
          id="tasting-category"
          aria-label="Category"
          value={search.category}
          onChange={(value: string): void => onChange({ category: value || undefined })}
          options={bottleCategoryOptions(tree.data ?? [], search.category)}
          clearLabel="All categories"
          searchPlaceholder="Search categories"
        />
      </div>
      <div className="grid gap-1.5">
        <span className="font-medium text-sm">Minimum score</span>
        <RatingStars
          label="Minimum score"
          value={search.score ?? null}
          onChange={(score: number | null): void => onChange({ score: score ?? undefined })}
        />
      </div>
      <label className={toggleChip({ className: "w-fit" })}>
        <input
          type="checkbox"
          className="sr-only"
          checked={search.mine === true}
          onChange={(event: ChangeEvent<HTMLInputElement>): void =>
            onChange({ mine: event.target.checked || undefined })
          }
        />
        <NotebookPen className="size-4" aria-hidden />
        Only mine
      </label>
      <FeedbackVisibilityFilter
        value={search.visibility}
        onChange={(visibility: Visibility | undefined): void => onChange({ visibility })}
      />
      <Button
        variant="outline"
        onClick={(): void =>
          onChange({
            category: undefined,
            product: undefined,
            score: undefined,
            mine: undefined,
            visibility: undefined,
          })
        }
      >
        Clear filters
      </Button>
    </div>
  );
}
