import type {
  CountryCode,
  CreateProduct,
  CreatePurchase,
  NO_STATUS,
  Page,
  Product,
  ProductStatus,
  UpdateProduct,
  UpdatePurchase,
} from "@larder/shared";
import {
  hashKey,
  type InfiniteData,
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "@/components/toaster.tsx";
import { api, unwrap } from "./client.ts";
import { isFavouritesList } from "./query-cache.ts";
import { stockMeta } from "./stock.ts";

const bar = api.api.bars[":barId"];

export const productsKey = (barId: string) => ["bars", barId, "products"] as const;

export interface ProductFilters {
  q?: string;
  category_id?: string;
  /** Any of these statuses; `none` for bottles without one. */
  status?: (ProductStatus | typeof NO_STATUS)[];
  country?: CountryCode;
  /** Only the viewer's favourites. */
  favourite?: true | undefined;
  limit?: number;
}

/** The bar's bottles matching `filters`, sorted by name, one page at a time ("Load more"). */
export const productListQuery = (barId: string, filters: ProductFilters) =>
  infiniteQueryOptions({
    queryKey: [...productsKey(barId), "list", filters],
    queryFn: async ({ pageParam, signal }) => {
      const query = {
        limit: filters.limit?.toString(),
        ...(filters.q && { q: filters.q }),
        ...(filters.category_id && { category_id: filters.category_id }),
        ...(filters.country && { country: filters.country }),
        ...(filters.favourite && { favourite: "true" }),
        ...(filters.status?.length && { status: filters.status.join(",") }),
        ...(pageParam && { cursor: pageParam }),
      };
      return unwrap(await bar.products.$get({ param: { barId }, query }, { init: { signal } }));
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    // Keep the current list on screen while a new filter loads.
    placeholderData: keepPreviousData,
  });

export const productQuery = (barId: string, id: string) =>
  queryOptions({
    queryKey: [...productsKey(barId), "detail", id],
    queryFn: async () => unwrap(await bar.products[":id"].$get({ param: { barId, id } })),
  });

/** Create, update and delete; each refreshes every product query of the bar. */
export function useProductMutations(barId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: productsKey(barId) });
  return {
    create: useMutation({
      meta: stockMeta(barId),
      mutationFn: async (json: CreateProduct) =>
        unwrap(await bar.products.$post({ param: { barId }, json })),
      onSuccess,
    }),
    update: useMutation({
      meta: stockMeta(barId),
      mutationFn: async ({ id, json }: { id: string; json: UpdateProduct }) =>
        unwrap(await bar.products[":id"].$patch({ param: { barId, id }, json })),
      onSuccess,
    }),
    remove: useMutation({
      meta: stockMeta(barId),
      mutationFn: async (id: string) =>
        unwrap(await bar.products[":id"].$delete({ param: { barId, id } })),
      // Everything but the deleted bottle's own page, which is still open: refetching it would only
      // flash a 404 before the page navigates away.
      onSuccess: (_, id) => {
        const deleted = hashKey(productQuery(barId, id).queryKey);
        return queryClient.invalidateQueries({
          queryKey: productsKey(barId),
          predicate: (query) => query.queryHash !== deleted,
        });
      },
    }),
  };
}

export const purchasesQuery = (barId: string, productId: string) =>
  queryOptions({
    queryKey: [...productsKey(barId), "purchases", productId],
    queryFn: async () =>
      unwrap(await bar.products[":id"].purchases.$get({ param: { barId, id: productId } })),
  });

type ListData = InfiniteData<Page<Product>, string>;

/**
 * Cache helpers for bottle mutations. Changes are written straight into the
 * cached detail and lists, so the shown row changes at once without refetching every loaded page
 * (a filtered list keeps the row until it refetches). Cocktails refresh through `stockMeta`, since
 * stock drives what can be made.
 */
function useProductCache(barId: string) {
  const queryClient = useQueryClient();
  const write = (id: string, change: (product: Product) => Product) => {
    queryClient.setQueryData<Product>(productQuery(barId, id).queryKey, (p) => p && change(p));
    queryClient.setQueriesData<ListData>({ queryKey: [...productsKey(barId), "list"] }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((p) => (p.id === id ? change(p) : p)),
            })),
          }
        : data,
    );
  };
  /** Marks every bottle query stale; only the bottle's purchase history refetches now. */
  const settled = (id: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: productsKey(barId), refetchType: "none" }),
      queryClient.invalidateQueries({ queryKey: purchasesQuery(barId, id).queryKey }),
    ]);
  /** For changes whose answer is not the bottle: refetch what is on screen. */
  const refresh = () => queryClient.invalidateQueries({ queryKey: productsKey(barId) });
  return { write, settled, refresh };
}

const product = (barId: string, id: string) => ({ param: { barId, id } });

/** "Bought": records `count` bottles; buying always puts the bottle in the bar. */
export function useBuyBottle(barId: string) {
  const { write, refresh } = useProductCache(barId);
  return useMutation({
    meta: stockMeta(barId),
    mutationFn: async ({ id, json }: { id: string; json: CreatePurchase }) =>
      unwrap(await bar.products[":id"].purchases.$post({ ...product(barId, id), json })),
    onSuccess: (_, { id }) => {
      write(id, (p) => ({ ...p, status: "owned" }));
      return refresh();
    },
  });
}

/** "Ran out": closes the oldest open bottle. */
export function useFinishBottle(barId: string) {
  const { write, settled } = useProductCache(barId);
  return useMutation({
    meta: stockMeta(barId),
    mutationFn: async ({ id, finished_on }: { id: string; finished_on: string }) =>
      unwrap(
        await bar.products[":id"].finish.$post({ ...product(barId, id), json: { finished_on } }),
      ),
    onSuccess: (saved) => {
      write(saved.id, () => saved);
      return settled(saved.id);
    },
  });
}

/** Sets the status by hand; purchases are left untouched. */
export function useSetBottleStatus(barId: string) {
  const { write, settled } = useProductCache(barId);
  return useMutation({
    meta: stockMeta(barId),
    mutationFn: async ({ id, status }: { id: string; status: ProductStatus | null }) =>
      unwrap(await bar.products[":id"].status.$patch({ ...product(barId, id), json: { status } })),
    onSuccess: (saved) => {
      write(saved.id, () => saved);
      return settled(saved.id);
    },
  });
}

/** Editing and removing a purchase, which can reopen or finish the bottle. */
export function usePurchaseMutations(barId: string) {
  const { refresh } = useProductCache(barId);
  const purchase = (id: string, purchaseId: string) => ({ param: { barId, id, purchaseId } });
  return {
    update: useMutation({
      meta: stockMeta(barId),
      mutationFn: async (args: { id: string; purchaseId: string; json: UpdatePurchase }) =>
        unwrap(
          await bar.products[":id"].purchases[":purchaseId"].$patch({
            ...purchase(args.id, args.purchaseId),
            json: args.json,
          }),
        ),
      onSuccess: refresh,
    }),
    remove: useMutation({
      meta: stockMeta(barId),
      mutationFn: async ({ id, purchaseId }: { id: string; purchaseId: string }) =>
        unwrap(
          await bar.products[":id"].purchases[":purchaseId"].$delete(purchase(id, purchaseId)),
        ),
      onSuccess: refresh,
    }),
  };
}

type BottleFavouriteChange = { id: string; favourite: boolean };

/**
 * Adds or removes a bottle from the viewer's favourites. The heart changes at once in the detail
 * and the lists, and rolls back with a toast if the request fails.
 */
export function useSetBottleFavourite(barId: string) {
  const queryClient = useQueryClient();
  const { write } = useProductCache(barId);
  const listKey = [...productsKey(barId), "list"];
  const mutationKey = [...productsKey(barId), "favourite"];
  const pendingIds = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: ({ state }) => (state.variables as BottleFavouriteChange).id,
  });
  const mark = (id: string, favourite: boolean) =>
    write(id, (bottle) => ({ ...bottle, is_favourite: favourite }));
  const { mutate } = useMutation({
    mutationKey,
    mutationFn: async ({ id, favourite }: BottleFavouriteChange) =>
      favourite
        ? unwrap(await bar.products[":id"].favourite.$put(product(barId, id)))
        : unwrap(await bar.products[":id"].favourite.$delete(product(barId, id))),
    onMutate: async ({ id, favourite }) => {
      const detailKey = productQuery(barId, id).queryKey;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: detailKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);
      mark(id, favourite);
    },
    onSuccess: (_, { id, favourite }) => mark(id, favourite),
    onError: (error, { id, favourite }) => {
      mark(id, !favourite);
      toast("Could not update your favourites", { description: error.message, variant: "error" });
    },
    // The optimistic change is already right; only favourites-only lists may differ.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: listKey, predicate: isFavouritesList }),
  });
  return { mutate, pendingIds };
}
