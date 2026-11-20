import type {
  CocktailDetail,
  CocktailIngredient,
  MissingIngredient,
  PantryIngredient,
} from "@larder/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { cocktailsKey } from "@/api/cocktails.ts";
import { usePantryMutations } from "@/api/pantry.ts";
import { useProductMutations, useSetProductInBar } from "@/api/products.ts";
import { createQueryClient } from "@/api/query-client.ts";
import { BAR_ID, server } from "@/test/msw.ts";
import { choose, renderWithProviders } from "@/test/render.tsx";

const base = `/api/bars/${BAR_ID}`;
const id = (n: number) => `01a1f326-d941-7d74-8a40-504a488ce${String(n).padStart(3, "0")}`;
const time = { created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const page = <T,>(items: T[]) => HttpResponse.json({ items, next_cursor: null });

const BOTTLES = ["Beefeater", "Tanqueray", "Sipsmith"];
const source = (n: number, name: string, bottles: string[] = []) => ({
  id: id(n),
  position: 0,
  category_id: id(100 + n),
  product_id: null,
  pantry_ingredient_id: null,
  name,
  category_path: [],
  abv: 0,
  note: null,
  matching_bottles: bottles.map((name) => ({ id: id(200 + BOTTLES.indexOf(name)), name })),
});
const line = (
  n: number,
  name: string,
  bottles: string[] = [],
  alternatives: CocktailIngredient["alternatives"] = [],
): CocktailIngredient => ({
  ...source(n, name, bottles),
  amount: 30,
  unit: "ml",
  optional: false,
  preparation_only: false,
  alternatives,
});
const lemonMissing: MissingIngredient = {
  id: id(2),
  name: "Lemon",
  alternatives: ["Bottled lemon"],
};
const cocktail = (
  n: number,
  name: string,
  extra: Partial<CocktailDetail> = {},
): CocktailDetail => ({
  ...time,
  id: id(50 + n),
  name,
  method: "shaken",
  ice: "cubes",
  glass_id: null,
  servings: 1,
  variant_of_id: null,
  description: null,
  garnish: null,
  serving_notes: null,
  source: null,
  notes: null,
  variant_note: null,
  image_id: null,
  computed: { abv: 20, volume_ml: 60, spirits: [], ingredients: [] },
  missing: [],
  ingredients: [],
  steps: [],
  tools: [],
  tags: [],
  ...extra,
});
const ready = cocktail(1, "Martinez");
const short = cocktail(2, "Whisky Sour", { missing: [lemonMissing] });

it("filters by what the bar can make and shows badges and missing items on cards", async () => {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`${base}/cocktails`, ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return page([ready, short]);
    }),
  );
  const { user, router } = renderWithProviders("/cocktails?missing=bogus");
  const cards = await screen.findByRole("list", { name: "Cocktails" });
  expect(requests[0]?.has("missing")).toBe(false);
  expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
  expect(within(cards).getByText("Can make")).toBeInTheDocument();
  expect(within(cards).getByText("Missing 1")).toBeInTheDocument();
  expect(within(cards).getByText("Missing: Lemon or Bottled lemon")).toBeInTheDocument();

  await user.click(screen.getByRole("radio", { name: "Can make now" }));
  await waitFor(() => expect(Object.fromEntries(requests.at(-1) ?? [])).toEqual({ missing: "0" }));
  expect(router.state.location.search).toEqual({ missing: 0 });

  await user.click(screen.getByRole("radio", { name: "Missing one" }));
  await waitFor(() => expect(Object.fromEntries(requests.at(-1) ?? [])).toEqual({ missing: "1" }));

  await user.click(screen.getByRole("radio", { name: "All" }));
  await waitFor(() => expect(Object.fromEntries(requests.at(-1) ?? [])).toEqual({}));

  await user.click(screen.getByRole("button", { name: "List view" }));
  const rows = screen.getByRole("list", { name: "Cocktails" });
  expect(within(rows).getByText("Can make")).toBeInTheDocument();
  expect(within(rows).getByText("Missing: Lemon or Bottled lemon")).toBeInTheDocument();
});

it("shows what is missing on the recipe and lets you pick an owned bottle for a generic line", async () => {
  const recipe = cocktail(3, "Gin Sour", {
    missing: [lemonMissing],
    ingredients: [
      line(
        1,
        "Gin",
        ["Beefeater", "Tanqueray"],
        [source(3, "London dry", ["Tanqueray", "Sipsmith"])],
      ),
      line(2, "Lemon"),
    ],
  });
  server.use(http.get(`${base}/cocktails/${recipe.id}`, () => HttpResponse.json(recipe)));
  const { user } = renderWithProviders(`/cocktails/${recipe.id}`);
  const notice = (await screen.findByText("Missing 1 ingredient")).parentElement as HTMLElement;
  expect(within(notice).getByText("Lemon or Bottled lemon")).toBeInTheDocument();
  const lemon = (await screen.findByText(/Lemon$/)).closest("li") as HTMLElement;
  expect(within(lemon).getByText("Missing")).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: /for Lemon/ })).toBeNull();

  const picker = screen.getByRole("combobox", { name: "Use this bottle for Gin" });
  expect(picker).toHaveTextContent("Any bottle");
  await user.click(picker);
  // A bottle matching both the preferred source and the substitute is listed once.
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "Any bottle",
    "Beefeater",
    "Tanqueray",
    "Sipsmith",
  ]);
  await user.click(screen.getByRole("option", { name: "Sipsmith" }));
  expect(picker).toHaveTextContent("Sipsmith");

  // The pick survives rescaling the recipe.
  await user.click(screen.getByRole("button", { name: "More servings" }));
  expect(await screen.findByText("2 servings")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Use this bottle for Gin" })).toHaveTextContent(
      "Sipsmith",
    ),
  );
  await choose(user, "Use this bottle for Gin", "Any bottle");
  expect(screen.getByRole("combobox", { name: "Use this bottle for Gin" })).toHaveTextContent(
    "Any bottle",
  );
});

it.each([
  { recipe: ready, text: "You can make this now." },
  {
    recipe: cocktail(4, "Ramos", {
      missing: [lemonMissing, { ...lemonMissing, id: id(9), name: "Egg", alternatives: [] }],
    }),
    text: "Missing 2 ingredients",
  },
])("summarises stock: $text", async ({ recipe, text }) => {
  server.use(http.get(`${base}/cocktails/${recipe.id}`, () => HttpResponse.json(recipe)));
  renderWithProviders(`/cocktails/${recipe.id}`);
  expect(await screen.findByText(text)).toBeInTheDocument();
});

/** Each row is a hook that returns a function running one stock mutation. */
const stockChanges: [string, () => () => Promise<unknown>][] = [
  [
    "putting a bottle in the bar",
    () => {
      const { mutateAsync } = useSetProductInBar(BAR_ID);
      return () => mutateAsync({ id: id(400), in_bar: true });
    },
  ],
  [
    "adding a bottle",
    () => {
      const { mutateAsync } = useProductMutations(BAR_ID).create;
      return () => mutateAsync({ name: "Gin", category_id: id(401) });
    },
  ],
  [
    "editing a bottle",
    () => {
      const { mutateAsync } = useProductMutations(BAR_ID).update;
      return () => mutateAsync({ id: id(400), json: { name: "Gin" } });
    },
  ],
  [
    "deleting a bottle",
    () => {
      const { mutateAsync } = useProductMutations(BAR_ID).remove;
      return () => mutateAsync(id(400));
    },
  ],
  [
    "adding a Pantry ingredient",
    () => {
      const { mutateAsync } = usePantryMutations(BAR_ID).create;
      return () => mutateAsync({ name: "Lime", category_id: id(401) });
    },
  ],
  [
    "editing a Pantry ingredient",
    () => {
      const { mutateAsync } = usePantryMutations(BAR_ID).update;
      return () => mutateAsync({ id: id(400), json: { always_available: true } });
    },
  ],
  [
    "deleting a Pantry ingredient",
    () => {
      const { mutateAsync } = usePantryMutations(BAR_ID).remove;
      return () => mutateAsync(id(400));
    },
  ],
];

it.each(stockChanges)("%s marks the cocktails stale", async (_label, useChange) => {
  const answer = ({ request }: { request: Request }) =>
    request.method === "DELETE"
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ id: id(400) });
  server.use(
    http.all(`${base}/products*`, answer),
    http.all(`${base}/pantry-ingredients*`, answer),
  );
  const queryClient = createQueryClient();
  const listKey = [...cocktailsKey(BAR_ID), "list", {}];
  queryClient.setQueryData(listKey, { pages: [], pageParams: [] });
  const { result } = renderHook(useChange, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  await act(() => result.current());
  expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
});

it("restocking a lemon in the Pantry updates the cocktails on return", async () => {
  const garnish = id(300);
  let lemon: PantryIngredient = {
    ...time,
    id: id(301),
    name: "Lemon",
    category_id: garnish,
    category_name: "Garnish",
    in_stock: false,
    always_available: false,
  };
  server.use(
    http.get(`${base}/cocktails`, () => page([lemon.in_stock ? { ...short, missing: [] } : short])),
    http.get(`${base}/categories/tree`, () =>
      HttpResponse.json({
        items: [
          {
            ...time,
            id: garnish,
            name: "Garnish",
            parent_id: null,
            kind: "garnish",
            default_abv: null,
            description: null,
            image_id: null,
            children: [],
          },
        ],
      }),
    ),
    http.get(`${base}/pantry-ingredients`, () => page([lemon])),
    http.patch(`${base}/pantry-ingredients/${lemon.id}`, async ({ request }) => {
      lemon = { ...lemon, ...((await request.json()) as Partial<PantryIngredient>) };
      return HttpResponse.json(lemon);
    }),
  );
  const { user, queryClient } = renderWithProviders("/cocktails?missing=1");
  const cards = await screen.findByRole("list", { name: "Cocktails" });
  expect(within(cards).getByText("Missing 1")).toBeInTheDocument();

  await user.click(screen.getAllByRole("link", { name: "Pantry" })[0] as HTMLElement);
  const toggle = await screen.findByRole("button", { name: "Lemon in stock" });
  await user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
  // The stock change marks the cached cocktail list out of date.
  const [cocktails] = queryClient.getQueryCache().findAll({ queryKey: cocktailsKey(BAR_ID) });
  expect(cocktails?.state.isInvalidated).toBe(true);

  await user.click(screen.getAllByRole("link", { name: "Cocktails" })[0] as HTMLElement);
  expect(
    await within(await screen.findByRole("list", { name: "Cocktails" })).findByText("Can make"),
  ).toBeInTheDocument();
});
