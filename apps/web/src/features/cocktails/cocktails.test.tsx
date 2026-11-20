import type { CocktailDetail, CocktailIngredient, CreateCocktail, Utensil } from "@larder/shared";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { failure, fixtureId, page, timestamps, unrated } from "@/test/fixtures.ts";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { choose, pick, renderWithProviders } from "@/test/render.tsx";

const base = `/api/bars/${BAR_ID}`;
const id = (n: number) => fixtureId(n, "504a488cd");
const gin = { id: id(1), name: "Gin" };
const glass: Utensil = {
  ...timestamps,
  id: id(2),
  name: "Coupe",
  kind: "glass",
  capacity_ml: null,
  description: null,
  image_id: null,
};
const tag = { id: id(3), name: "Classic" };
const ingredient: CocktailIngredient = {
  id: id(4),
  position: 0,
  category_id: gin.id,
  product_id: null,
  pantry_ingredient_id: null,
  name: gin.name,
  category_path: [gin],
  abv: 40,
  note: null,
  unit: "ml",
  amount: 30,
  optional: false,
  preparation_only: false,
  matching_bottles: [],
  alternatives: [],
};
const recipe: CocktailDetail = {
  ...timestamps,
  id: id(5),
  name: "Gimlet",
  method: "shaken",
  ice: "large_cube",
  glass_id: glass.id,
  servings: 1,
  variant_of_id: null,
  ...unrated,
  description: "Bright and tart.",
  garnish: "Lime wheel",
  serving_notes: "Chill the glass",
  source: "House recipe",
  notes: "Serve immediately",
  variant_note: null,
  image_id: id(6),
  computed: { abv: 18, volume_ml: 30, spirits: [gin], ingredients: ["Gin", "Lime cordial"] },
  missing: [],
  ingredients: [
    ingredient,
    {
      ...ingredient,
      id: id(7),
      position: 1,
      amount: 1,
      unit: "dash",
      optional: true,
      name: "Aromatic bitters",
      note: "to finish",
      alternatives: [{ ...ingredient, id: id(8), name: "Orange bitters", note: "if preferred" }],
    },
  ],
  steps: [{ id: id(9), position: 0, text: "Shake with ice" }],
  tools: [{ id: id(10), name: "Shaker" }],
  tags: [tag],
};
const emptyRecipe = {
  ...recipe,
  id: id(11),
  name: "Water",
  image_id: null,
  glass_id: null,
  description: null,
  ingredients: [],
  steps: [],
  computed: { abv: 0, volume_ml: null, spirits: [], ingredients: [] },
};
const detail = `${base}/cocktails/${recipe.id}`;

it("filters and pages cocktail cards, and restores filters after viewing a recipe", async () => {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`${base}/categories/tree`, () =>
      HttpResponse.json({
        items: [
          {
            ...timestamps,
            ...gin,
            kind: "spirit",
            parent_id: null,
            default_abv: 40,
            description: null,
            image_id: null,
            children: [],
          },
          {
            ...timestamps,
            id: id(12),
            name: "Citrus",
            kind: "juice",
            parent_id: null,
            default_abv: null,
            description: null,
            image_id: null,
            children: [],
          },
        ],
      }),
    ),
    http.get(`${base}/utensils`, ({ request }) => {
      expect(new URL(request.url).searchParams.get("kind")).toBe("glass");
      return page([glass]);
    }),
    http.get(`${base}/tags`, ({ request }) =>
      new URL(request.url).searchParams.has("cursor") ? page([tag]) : page([], "tags-next"),
    ),
    http.get(`${base}/cocktails`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      requests.push(query);
      if (query.get("q") === "none") return page([]);
      return query.has("cursor") ? page([emptyRecipe]) : page([recipe], "more");
    }),
    http.get(detail, () => HttpResponse.json(recipe)),
    http.get(`${base}/utensils/${glass.id}`, () => HttpResponse.json(glass)),
  );
  const { user } = renderWithProviders("/cocktails?method=invalid");
  const cards = await screen.findByRole("list", { name: "Cocktails" });
  expect(within(cards).getByText("Gin, Lime cordial")).toBeInTheDocument();
  expect(within(cards).getByText("shaken · Gin")).toBeInTheDocument();
  expect(within(cards).getByText("≈ 18% ABV")).toBeInTheDocument();
  expect(within(cards).getByAltText("")).toHaveAttribute(
    "src",
    `/api/images/${recipe.image_id}/thumb`,
  );
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await within(cards).findByText("Water")).toBeInTheDocument();
  expect(requests.at(-1)?.get("cursor")).toBe("more");

  const tick = async (label: string, option: string) => {
    await user.click(screen.getByRole("combobox", { name: label }));
    await user.click(await screen.findByRole("option", { name: option }));
    await user.keyboard("{Escape}");
  };
  await user.click(screen.getByRole("combobox", { name: "Alcohol" }));
  expect(await screen.findByRole("option", { name: "Gin" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Citrus" })).toBeNull();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: "Mixers" }));
  expect(await screen.findByRole("option", { name: "Citrus" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Gin" })).toBeNull();
  await user.keyboard("{Escape}");
  await tick("Alcohol", "Gin");
  await tick("Mixers", "Citrus");
  await tick("Tags", "Classic");
  await tick("Method", "shaken");
  await tick("Method", "stirred");
  expect(screen.getByRole("combobox", { name: "Method" })).toHaveTextContent("Method: shaken+1");
  const search = screen.getByRole("searchbox");
  await user.type(search, "Gim");
  await waitFor(() =>
    expect(Object.fromEntries(requests.at(-1) ?? [])).toEqual({
      q: "Gim",
      alcohol: gin.id,
      mixer: id(12),
      tag: tag.id,
      method: "shaken,stirred",
    }),
  );
  await user.click(await screen.findByRole("link", { name: /Gimlet/ }));
  expect(await screen.findByRole("heading", { name: "Gimlet" })).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "All cocktails" }));
  expect(await screen.findByRole("searchbox")).toHaveValue("Gim");
  await user.click(screen.getByRole("combobox", { name: "Method" }));
  await user.click(await screen.findByRole("option", { name: "stirred" }));
  await user.click(await screen.findByRole("button", { name: "Clear selection" }));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("combobox", { name: "Method" })).toHaveTextContent(/^Method$/);
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull());
  expect(screen.getByRole("searchbox")).toHaveValue("Gim");
  await user.clear(screen.getByRole("searchbox"));
  await waitFor(() => expect(requests.at(-1)?.has("q")).toBe(false));
  await user.type(screen.getByRole("searchbox"), "none");
  expect(await screen.findByText("No cocktails match")).toBeInTheDocument();
});

it("shows the recipe, shares quantities across alternatives, and scales servings", async () => {
  server.use(
    http.get(detail, ({ request }) => {
      const count = new URL(request.url).searchParams.get("servings");
      if (count === "3") return failure("VALIDATION", 400);
      return HttpResponse.json(
        count === "2"
          ? {
              ...recipe,
              servings: 2,
              computed: { ...recipe.computed, volume_ml: 60 },
              ingredients: recipe.ingredients.map((line) => ({
                ...line,
                amount: (line.amount as number) * 2,
              })),
            }
          : recipe,
      );
    }),
    http.get(`${base}/utensils/${glass.id}`, () => HttpResponse.json(glass)),
  );
  const { user } = renderWithProviders(`/cocktails/${recipe.id}`);
  expect(await screen.findByRole("heading", { name: "Gimlet" })).toBeInTheDocument();
  expect(screen.getByAltText("Gimlet")).toHaveAttribute("src", `/api/images/${recipe.image_id}`);
  for (const text of [
    "Bright and tart.",
    "Shake with ice",
    "Shaker",
    "Chill the glass",
    "Lime wheel",
    "Classic",
    "30 ml",
    "≈ 18% ABV · 30 ml",
  ]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.getByText(/Aromatic bitters/)).toHaveTextContent(
    "1 dash Aromatic bitters (to finish) or Orange bitters (if preferred) (optional)",
  );
  expect(await screen.findByText("Coupe")).toBeInTheDocument();
  const fewer = screen.getByRole("button", { name: "Fewer servings" });
  const more = screen.getByRole("button", { name: "More servings" });
  expect(fewer).toBeDisabled();
  await user.click(more);
  expect(await screen.findByText("60 ml")).toBeInTheDocument();
  expect(screen.getByText("≈ 18% ABV · 60 ml")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "oz" }));
  expect(screen.getByText("2 oz")).toBeInTheDocument();
  expect(screen.getByText("≈ 18% ABV · 2 oz")).toBeInTheDocument();
  expect(screen.getByText("2 dashes")).toBeInTheDocument();
  await user.click(more);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("VALIDATION");
  await user.click(within(alert).getByRole("button", { name: "Try again" }));
  await user.click(fewer);
  await user.click(fewer);
  expect(await screen.findByText("1 oz")).toBeInTheDocument();
  expect(fewer).toBeDisabled();
});

it("recovers from independent filter and list requests failing", async () => {
  server.use(
    http.get(`${base}/cocktails`, () => failure("INTERNAL", 500), { once: true }),
    http.get(`${base}/tags`, () => failure("FORBIDDEN", 403), { once: true }),
  );
  const { user } = renderWithProviders("/cocktails");
  for (const code of ["INTERNAL", "FORBIDDEN"]) {
    const message = await screen.findByText(code);
    const alert = (await screen.findAllByRole("alert")).find((item) =>
      item.contains(message),
    ) as HTMLElement;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
  }
  expect(await screen.findByText("No cocktails yet")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("reports missing recipes and lets the user retry detail and glass errors", async () => {
  server.use(
    http.get(`${base}/cocktails/${emptyRecipe.id}`, () => HttpResponse.json(emptyRecipe)),
    http.get(detail, () => failure("INTERNAL", 500), { once: true }),
    http.get(detail, () => HttpResponse.json(recipe)),
    http.get(`${base}/utensils/${glass.id}`, () => failure("INTERNAL", 500), { once: true }),
    http.get(`${base}/utensils/${glass.id}`, () => HttpResponse.json(glass)),
    http.get(`${base}/cocktails/${id(99)}`, () => failure("NOT_FOUND", 404)),
  );
  const { user, router } = renderWithProviders(`/cocktails/${recipe.id}`);
  await user.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Gimlet" })).toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Coupe")).toBeInTheDocument();
  await router.navigate({ to: "/cocktails/$cocktailId", params: { cocktailId: emptyRecipe.id } });
  expect(await screen.findByText("No ingredients yet.")).toBeInTheDocument();
  expect(screen.getByText(/Volume unavailable/)).toBeInTheDocument();
  await router.navigate({ to: "/cocktails/$cocktailId", params: { cocktailId: id(99) } });
  expect(await screen.findByText("Cocktail not found")).toBeInTheDocument();
});

const lime = { id: id(13), name: "Lime" };
const bottle = { id: id(14), name: "London Dry" };
const shaker: Utensil = { ...glass, id: id(10), name: "Shaker", kind: "tool" };

function editorCatalogue() {
  server.use(
    http.get(`${base}/utensils`, ({ request }) =>
      page(new URL(request.url).searchParams.get("kind") === "glass" ? [glass] : [glass, shaker]),
    ),
    http.get(`${base}/categories/tree`, () =>
      HttpResponse.json({
        items: [
          {
            ...timestamps,
            ...gin,
            kind: "spirit",
            parent_id: null,
            default_abv: 40,
            description: null,
            image_id: null,
            children: [],
          },
        ],
      }),
    ),
    http.get(`${base}/products`, () => page([{ ...bottle, category_name: gin.name }])),
    http.get(`${base}/pantry-ingredients`, () => page([{ ...lime, category_name: "Citrus" }])),
    http.get(`${base}/utensils/${glass.id}`, () => HttpResponse.json(glass)),
  );
}

it("creates a recipe with reordered ingredients, alternatives, steps, tools, tags, and a picture", async () => {
  editorCatalogue();
  let body: CreateCocktail | undefined;
  const created = { ...recipe, name: "House Gimlet", image_id: null };
  let savedImage: string | null = null;
  server.use(
    http.post(`${base}/cocktails`, async ({ request }) => {
      body = (await request.json()) as CreateCocktail;
      return HttpResponse.json(created, { status: 201 });
    }),
    http.put(`${detail}/image`, ({ request }) => {
      expect(body?.name).toBe("House Gimlet");
      expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data/);
      savedImage = recipe.image_id;
      return HttpResponse.json({ id: savedImage });
    }),
    http.get(detail, () => HttpResponse.json({ ...created, image_id: savedImage })),
  );
  const { user } = renderWithProviders("/cocktails?q=Gimlet");
  await user.click(await screen.findByRole("link", { name: "Add cocktail" }));
  await user.type(await screen.findByLabelText("Name"), "House Gimlet");
  await choose(user, "Method", "stirred");
  await choose(user, "Ice", "large cube");
  await user.clear(screen.getByLabelText("Servings"));
  await user.type(screen.getByLabelText("Servings"), "2");
  await choose(user, "Glass", "Coupe");
  await user.type(screen.getByLabelText("Garnish"), "Lime wheel");
  await user.type(screen.getByLabelText("Serving notes"), "Use a chilled glass");

  const addIngredient = screen.getByRole("button", { name: "Add ingredient" });
  const save = screen.getByRole("button", { name: "Add cocktail" });
  const row = (index: number) => within(screen.getByRole("group", { name: `Ingredient ${index}` }));
  await user.click(addIngredient);
  await user.click(save);
  expect(await screen.findByText("Choose an ingredient source")).toBeInTheDocument();
  await pick(user, row(1).getByLabelText("Preferred source"), "Gin");
  await user.click(save);
  expect(await screen.findByText("Enter an amount for this unit")).toBeInTheDocument();
  await user.type(row(1).getByLabelText("Amount"), "30");
  await user.type(row(1).getByLabelText("Preparation note"), "London dry style");
  await user.click(row(1).getByLabelText(/Preparation only/));
  await user.click(row(1).getByRole("button", { name: "Add alternative" }));
  const alternative = within(row(1).getByRole("group", { name: "Alternative 1" }));
  await pick(user, alternative.getByLabelText("Substitute"), "London Dry · Gin");
  await user.type(alternative.getByLabelText("Preparation note"), "Chilled");
  await user.click(row(1).getByRole("button", { name: "Add alternative" }));
  await user.click(
    within(row(1).getByRole("group", { name: "Alternative 2" })).getByRole("button", {
      name: "Remove alternative",
    }),
  );

  await user.click(addIngredient);
  await pick(user, row(2).getByLabelText("Preferred source"), "Lime · Citrus");
  await user.type(row(2).getByLabelText("Amount"), "2");
  await user.clear(row(2).getByLabelText("Amount"));
  await pick(user, row(2).getByLabelText("Unit"), "To taste");
  expect(row(2).getByLabelText("Amount")).toBeDisabled();
  await user.click(row(2).getByLabelText("Optional"));
  await user.click(row(2).getByRole("button", { name: "Move up" }));
  expect(row(1).getByLabelText("Preferred source")).toHaveTextContent("Lime · Citrus");
  expect(row(1).getByLabelText("Unit")).toHaveTextContent("To taste");
  expect(row(2).getByLabelText("Substitute")).toHaveTextContent("London Dry · Gin");
  await user.click(row(1).getByRole("button", { name: "Move down" }));
  await user.click(row(2).getByRole("button", { name: "Move up" }));
  await user.click(addIngredient);
  await user.click(row(3).getByRole("button", { name: "Remove ingredient" }));

  await user.click(screen.getByRole("button", { name: "Add step" }));
  await user.type(screen.getByLabelText("Step 1"), "Stir and strain");
  await user.click(screen.getByRole("button", { name: "Add step" }));
  await user.click(screen.getAllByRole("button", { name: "Remove step" })[1] as HTMLElement);
  await user.click(screen.getByRole("checkbox", { name: "Shaker" }));
  const newTag = screen.getByLabelText("New tag");
  await user.type(newTag, "{Enter}");
  await user.type(newTag, "Citrusy, tart{Enter}");
  await user.type(newTag, "Spare");
  await user.click(screen.getByRole("button", { name: "Add tag" }));
  await user.type(newTag, " citrusy, TART {Enter}");
  expect(screen.getByRole("list", { name: "Tags" })).toHaveTextContent("Citrusy, tartSpare");
  expect(newTag).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Remove tag Spare" }));
  await user.upload(
    screen.getByLabelText("Picture"),
    new File(["png"], "gimlet.png", { type: "image/png" }),
  );

  await user.click(save);
  expect(await screen.findByRole("heading", { name: "House Gimlet" })).toBeInTheDocument();
  expect(await screen.findByAltText("House Gimlet")).toHaveAttribute(
    "src",
    `/api/images/${recipe.image_id}`,
  );
  expect(body).toMatchObject({
    name: "House Gimlet",
    method: "stirred",
    ice: "large_cube",
    servings: 2,
    glass_id: glass.id,
    garnish: "Lime wheel",
    serving_notes: "Use a chilled glass",
    ingredients: [
      {
        pantry_ingredient_id: lime.id,
        amount: null,
        unit: "to_taste",
        optional: true,
        note: null,
        alternatives: [],
      },
      {
        category_id: gin.id,
        amount: 30,
        unit: "ml",
        optional: false,
        preparation_only: true,
        note: "London dry style",
        alternatives: [{ product_id: bottle.id, note: "Chilled" }],
      },
    ],
    steps: [{ text: "Stir and strain" }],
    tool_ids: [shaker.id],
    tags: ["Citrusy, tart"],
  });
  expect(screen.getByRole("link", { name: "All cocktails" })).toHaveAttribute(
    "href",
    "/cocktails?q=Gimlet",
  );
});

it("edits the original recipe after scaling, preserves input on a conflict, and removes a picture", async () => {
  editorCatalogue();
  const editable: CocktailDetail = {
    ...recipe,
    ingredients: [
      {
        ...ingredient,
        alternatives: [
          {
            ...ingredient,
            id: id(15),
            category_id: null,
            product_id: bottle.id,
            name: bottle.name,
          },
          {
            ...ingredient,
            id: id(16),
            category_id: null,
            pantry_ingredient_id: lime.id,
            name: lime.name,
          },
        ],
      },
    ],
  };
  let current = editable;
  let patch: CreateCocktail | undefined;
  server.use(
    http.get(detail, ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.has("servings")
          ? { ...current, servings: 2, ingredients: [{ ...ingredient, amount: 60 }] }
          : current,
      ),
    ),
    http.patch(
      detail,
      () =>
        HttpResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "Duplicate cocktail",
              details: [
                { path: ["name"], message: "Use a different name" },
                { path: ["tags", 0, "name"], message: "Tag is taken" },
              ],
            },
          },
          { status: 409 },
        ),
      { once: true },
    ),
    http.patch(detail, async ({ request }) => {
      patch = (await request.json()) as CreateCocktail;
      current = { ...current, name: patch.name, tools: [] };
      return HttpResponse.json(current);
    }),
    http.delete(`${detail}/image`, () => {
      current = { ...current, image_id: null };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders(`/cocktails/${recipe.id}`);
  await user.click(await screen.findByRole("button", { name: "More servings" }));
  expect(await screen.findByText("60 ml")).toBeInTheDocument();
  const actions = screen.getByRole("navigation", { name: "Cocktail actions" });
  await user.click(within(actions).getByRole("link", { name: "Edit cocktail" }));
  const name = await screen.findByLabelText("Name");
  expect(name).toHaveValue("Gimlet");
  expect(screen.getByLabelText("Servings")).toHaveValue(1);
  expect(screen.getByLabelText("Amount")).toHaveValue(30);
  expect(screen.getByLabelText("Glass")).toHaveTextContent("Coupe");
  expect(screen.getAllByLabelText("Substitute").map((picker) => picker.textContent)).toEqual([
    expect.stringMatching(/^London Dry/),
    expect.stringMatching(/^Lime/),
  ]);
  expect(screen.getByRole("list", { name: "Tags" })).toHaveTextContent("Classic");
  expect(screen.getByLabelText("Step 1")).toHaveValue("Shake with ice");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(await screen.findByRole("link", { name: "Edit cocktail" }));
  const title = await screen.findByLabelText("Name");
  await user.clear(title);
  await user.type(title, "London Gimlet");
  const tool = screen.getByRole("checkbox", { name: "Shaker" });
  expect(tool).toBeChecked();
  await user.click(tool);
  await user.click(screen.getByRole("button", { name: "Remove" }));
  const save = screen.getByRole("button", { name: "Save cocktail" });
  await user.click(save);
  expect(await screen.findByText("Use a different name")).toBeInTheDocument();
  expect(screen.getByText("Classic: Tag is taken")).toBeInTheDocument();
  expect(title).toHaveValue("London Gimlet");
  await user.click(save);
  expect(await screen.findByRole("heading", { name: "London Gimlet" })).toBeInTheDocument();
  expect(screen.queryByAltText("London Gimlet")).toBeNull();
  expect(patch).toEqual({ name: "London Gimlet", tool_ids: [] });
});

it("retries loading editor choices and cancels creation without writing", async () => {
  server.use(http.get(`${base}/utensils`, () => failure("INTERNAL", 500), { once: true }));
  const { user } = renderWithProviders("/cocktails/new?q=Gimlet");
  await user.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Add tools in Utensils to select them here.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByRole("searchbox")).toHaveValue("Gimlet");
});

it("hides editing actions from viewers and prevents direct access to the editor", async () => {
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        ...meFixture,
        bars: [{ id: BAR_ID, name: "Home bar", role: "viewer" }],
      }),
    ),
    http.get(`${base}/cocktails`, () => page([recipe])),
    http.get(detail, () => HttpResponse.json({ ...recipe, glass_id: null })),
  );
  const { user, router } = renderWithProviders("/cocktails");
  expect(await screen.findByRole("list", { name: "Cocktails" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Add cocktail" })).toBeNull();
  await user.click(screen.getByRole("link", { name: /Gimlet/ }));
  expect(await screen.findByRole("heading", { name: "Gimlet" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Edit cocktail" })).toBeNull();
  await router.navigate({ to: "/cocktails/$cocktailId/edit", params: { cocktailId: recipe.id } });
  expect(await screen.findByText("Editing is unavailable")).toBeInTheDocument();
});

it("keeps the draft and photo when editor or account data fails to refresh", async () => {
  let offline = false;
  server.use(
    http.get("/api/me", () => (offline ? failure("INTERNAL", 500) : HttpResponse.json(meFixture))),
    http.get(`${base}/utensils`, () => (offline ? failure("INTERNAL", 500) : page([]))),
  );
  const { user, queryClient } = renderWithProviders("/cocktails/new");
  const name = await screen.findByLabelText("Name");
  await user.type(name, "Unsaved Gimlet");
  await user.upload(
    screen.getByLabelText("Picture"),
    new File(["png"], "gimlet.png", { type: "image/png" }),
  );
  offline = true;
  await act(() => queryClient.refetchQueries({ type: "active" }));
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(screen.getByLabelText("Name")).toBe(name);
  expect(name).toHaveValue("Unsaved Gimlet");
  expect(screen.getByAltText("Preview")).toBeInTheDocument();
  offline = false;
  await user.click(screen.getAllByRole("button", { name: "Try again" })[0] as HTMLElement);
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(name).toHaveValue("Unsaved Gimlet");
});

it("preserves newer steps when only the cocktail name changes", async () => {
  editorCatalogue();
  let current = { ...recipe, ingredients: [] as CocktailIngredient[] };
  server.use(
    http.get(detail, () => HttpResponse.json(current)),
    http.patch(detail, async ({ request }) => {
      const patch = (await request.json()) as Partial<CocktailDetail>;
      expect(patch).toEqual({ name: "Gimlet No. 2" });
      current = { ...current, ...patch };
      return HttpResponse.json(current);
    }),
  );
  const { user } = renderWithProviders(`/cocktails/${recipe.id}/edit`);
  const title = await screen.findByLabelText("Name");
  current = { ...current, steps: [{ id: id(17), position: 0, text: "Updated in another tab" }] };
  await user.type(title, " No. 2");
  await user.click(screen.getByRole("button", { name: "Save cocktail" }));
  expect(await screen.findByText("Updated in another tab")).toBeInTheDocument();
});

it("saves image-only edits without a recipe PATCH", async () => {
  editorCatalogue();
  let current = { ...recipe, ingredients: [] as CocktailIngredient[] };
  server.use(
    http.get(detail, () => HttpResponse.json(current)),
    http.patch(detail, () => failure("INTERNAL", 500)),
    http.delete(`${detail}/image`, () => {
      current = { ...current, image_id: null };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders(`/cocktails/${recipe.id}/edit`);
  await user.click(await screen.findByRole("button", { name: "Remove" }));
  await user.click(screen.getByRole("button", { name: "Save cocktail" }));
  expect(await screen.findByRole("heading", { name: "Gimlet" })).toBeInTheDocument();
  expect(screen.queryByAltText("Gimlet")).toBeNull();
});

it("disables Cancel during a save and leaves navigation alone if the editor closes", async () => {
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  editorCatalogue();
  server.use(
    http.post(`${base}/cocktails`, async () => {
      started.resolve();
      await pending.promise;
      return HttpResponse.json(recipe, { status: 201 });
    }),
  );
  const { user, router } = renderWithProviders("/cocktails/new");
  await user.type(await screen.findByLabelText("Name"), "Gimlet");
  await user.click(screen.getByRole("button", { name: "Add cocktail" }));
  await started.promise;
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(router.state.location.pathname).toBe("/cocktails/new");
  await user.click(
    within(screen.getByRole("navigation", { name: "Sidebar" })).getByRole("link", {
      name: "Pantry",
    }),
  );
  expect(await screen.findByRole("heading", { name: "Pantry" })).toBeInTheDocument();
  pending.resolve();
  expect(await screen.findByText("Cocktail added")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/pantry");
});

it("retains loaded cards and retries only the failed page", async () => {
  const cursors: (string | null)[] = [];
  let failed = false;
  server.use(
    http.get(`${base}/cocktails`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      cursors.push(cursor);
      if (!cursor) return page([recipe], "next");
      if (failed) return page([emptyRecipe]);
      failed = true;
      return failure("INTERNAL", 500);
    }),
  );
  const { user } = renderWithProviders("/cocktails");
  await user.click(await screen.findByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("INTERNAL");
  expect(screen.getByRole("link", { name: /Gimlet/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry loading more" }));
  expect(await screen.findByRole("link", { name: /Water/ })).toBeInTheDocument();
  expect(cursors).toEqual([null, "next", "next"]);
});

it("keeps cached cocktails visible after a background list error", async () => {
  let offline = false;
  server.use(
    http.get(`${base}/cocktails`, () => (offline ? failure("INTERNAL", 500) : page([recipe]))),
  );
  const { user, queryClient } = renderWithProviders("/cocktails");
  expect(await screen.findByRole("link", { name: /Gimlet/ })).toBeInTheDocument();
  offline = true;
  await act(() => queryClient.refetchQueries({ queryKey: ["bars", BAR_ID, "cocktails", "list"] }));
  expect(await screen.findByRole("alert")).toHaveTextContent("INTERNAL");
  expect(screen.getByRole("link", { name: /Gimlet/ })).toBeInTheDocument();
  offline = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("lets users clear unavailable filters from a bookmarked URL", async () => {
  server.use(
    http.get(`${base}/cocktails`, ({ request }) =>
      new URL(request.url).searchParams.size > 0 ? page([]) : page([recipe]),
    ),
  );
  const list = (...ids: number[]) => encodeURIComponent(JSON.stringify(ids.map(id)));
  const lone = renderWithProviders(`/cocktails?tag=${id(52)}`);
  expect(await screen.findByRole("combobox", { name: "Tags" })).toHaveTextContent(/Tags: /);
  lone.unmount();
  const { user } = renderWithProviders(
    `/cocktails?tag=${list(52, 54)}&alcohol=${list(53)}&mixer=bad`,
  );
  for (const [filter, text] of [
    ["Tags", "Tags: Unavailable+1"],
    ["Alcohol", "Alcohol: Unavailable"],
  ] as const) {
    const trigger = await screen.findByRole("combobox", { name: filter });
    await waitFor(() => expect(trigger).toHaveTextContent(text));
  }
  expect(screen.getByRole("combobox", { name: "Mixers" })).toHaveTextContent(/^Mixers$/);
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(await screen.findByRole("link", { name: /Gimlet/ })).toBeInTheDocument();
});

it("commits cocktail search after typing pauses and aborts an obsolete request", async () => {
  const queries: (string | null)[] = [];
  const started = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  server.use(
    http.get(`${base}/cocktails`, async ({ request }) => {
      const q = new URL(request.url).searchParams.get("q");
      queries.push(q);
      if (q === "Gin") {
        request.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
        started.resolve();
        await aborted.promise;
      }
      return page(q === "Gimlet" ? [recipe] : []);
    }),
  );
  renderWithProviders("/cocktails");
  await screen.findByText("No cocktails yet");
  const search = screen.getByRole("searchbox");
  for (const value of ["G", "Gi", "Gin"]) fireEvent.change(search, { target: { value } });
  await started.promise;
  expect(queries).toEqual([null, "Gin"]);
  fireEvent.change(search, { target: { value: "Gimlet" } });
  expect(await screen.findByRole("link", { name: /Gimlet/ })).toBeInTheDocument();
  await aborted.promise;
  expect(queries).toEqual([null, "Gin", "Gimlet"]);
});

it("loads ingredient sources on demand, retries failed pages, and keeps selections while searching", async () => {
  editorCatalogue();
  const cursors: (string | null)[] = [];
  const queries: (string | null)[] = [];
  let failed = false;
  server.use(
    http.get(`${base}/products`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      cursors.push(params.get("cursor"));
      queries.push(params.get("q"));
      expect(params.get("limit")).toBe("25");
      if (params.has("q")) return page([]);
      if (!params.has("cursor")) return page([], "bottles-next");
      if (failed) return page([{ ...bottle, category_name: gin.name }]);
      failed = true;
      return failure("INTERNAL", 500);
    }),
    http.get(`${base}/pantry-ingredients`, ({ request }) => {
      const q = new URL(request.url).searchParams.get("q");
      return page(q === "Lime" ? [{ ...lime, category_name: "Citrus" }] : []);
    }),
  );
  const { user } = renderWithProviders("/cocktails/new");
  const add = await screen.findByRole("button", { name: "Add ingredient" });
  expect(cursors).toEqual([]);
  await user.click(add);
  const picker = screen.getByLabelText("Preferred source");
  await user.click(picker);
  await user.click(await screen.findByRole("button", { name: "Load more ingredient choices" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load ingredient choices");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await user.click(await screen.findByRole("option", { name: /London Dry/ }));
  expect(picker).toHaveTextContent("London Dry · Gin");
  await user.click(picker);
  await user.type(screen.getByLabelText("Search ingredients"), "Lime");
  expect(await screen.findByRole("option", { name: /Lime/ })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /London Dry/ })).toBeNull();
  // The choice is kept while the search shows other results.
  expect(picker).toHaveTextContent("London Dry · Gin");
  expect(cursors).toEqual([null, "bottles-next", "bottles-next", null]);
  expect(queries).toEqual([null, null, null, "Lime"]);
});

it("limits category options, loads more, and searches full paths while retaining the selection", async () => {
  editorCatalogue();
  const category = {
    ...timestamps,
    ...gin,
    kind: "spirit",
    parent_id: null,
    default_abv: 40,
    description: null,
    image_id: null,
    children: [],
  };
  const children = Array.from({ length: 27 }, (_, index) => ({
    ...category,
    id: id(200 + index),
    name: `Style ${index + 1}`,
    parent_id: gin.id,
  }));
  server.use(
    http.get(`${base}/categories/tree`, () =>
      HttpResponse.json({ items: [{ ...category, children }] }),
    ),
  );
  const { user } = renderWithProviders("/cocktails/new");
  await user.click(await screen.findByRole("button", { name: "Add ingredient" }));
  const picker = screen.getByLabelText("Preferred source");
  await user.click(picker);
  expect(await screen.findByRole("option", { name: "Gin › Style 24" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Gin › Style 25" })).not.toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "Load more ingredient choices" }));
  await user.click(await screen.findByRole("option", { name: "Gin › Style 27" }));
  expect(picker).toHaveTextContent("Gin › Style 27");
  await user.click(picker);
  const search = screen.getByLabelText("Search ingredients");
  await user.type(search, "GIN › STYLE 25");
  expect(await screen.findByRole("option", { name: "Gin › Style 25" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Gin › Style 24" })).not.toBeInTheDocument();
  expect(picker).toHaveTextContent("Gin › Style 27");
  await user.clear(search);
  await waitFor(() =>
    expect(screen.queryByRole("option", { name: "Gin › Style 26" })).not.toBeInTheDocument(),
  );
});

it("retries an initial ingredient search error without closing the editor", async () => {
  server.use(
    http.get(`${base}/products`, () => failure("INTERNAL", 500), { once: true }),
    http.get(`${base}/products`, () => page([{ ...bottle, category_name: gin.name }])),
  );
  const { user } = renderWithProviders("/cocktails/new");
  await user.click(await screen.findByRole("button", { name: "Add ingredient" }));
  await user.click(screen.getByLabelText("Preferred source"));
  const alert = await screen.findByRole("alert");
  await user.click(within(alert).getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("option", { name: /London Dry/ })).toBeInTheDocument();
});

it("switches to a compact list that shows ingredients, and remembers the choice", async () => {
  server.use(http.get(`${base}/cocktails`, () => page([recipe])));
  const first = renderWithProviders("/cocktails");
  await screen.findByRole("list", { name: "Cocktails" });
  expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
  await first.user.click(screen.getByRole("button", { name: "List view" }));
  const rows = screen.getByRole("list", { name: "Cocktails" });
  expect(within(rows).getByText("Gin, Lime cordial")).toBeInTheDocument();
  expect(within(rows).getByText("shaken · Gin")).toBeInTheDocument();
  expect(within(rows).getByRole("link", { name: /Gimlet/ })).toHaveAttribute(
    "href",
    `/cocktails/${recipe.id}`,
  );
  first.unmount();

  renderWithProviders("/cocktails");
  await screen.findByRole("list", { name: "Cocktails" });
  expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
});
