import type { Category, PantryIngredient } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { choose, renderWithProviders } from "@/test/render.tsx";

const url = `/api/bars/${BAR_ID}/pantry-ingredients`;
const treeUrl = `/api/bars/${BAR_ID}/categories/tree`;
const stamp = "2026-01-01T00:00:00.000Z";
let seq = 200;
const nextId = () => `01a1f326-d941-7d74-8a40-${String(++seq).padStart(12, "0")}`;

const category = (name: string): Category => ({
  id: nextId(),
  name,
  parent_id: null,
  kind: name === "Garnish" ? "garnish" : "other",
  default_abv: null,
  description: null,
  image_id: null,
  created_at: stamp,
  updated_at: stamp,
});
const garnish = category("Garnish");
const pantry = category("Pantry");

const ingredient = (
  name: string,
  group: Category,
  extra: Partial<PantryIngredient> = {},
): PantryIngredient => ({
  id: nextId(),
  name,
  category_id: group.id,
  category_name: group.name,
  in_stock: false,
  always_available: false,
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});

let store: PantryIngredient[] = [];
let requests: { method: string; body?: unknown }[] = [];
const byName = (name: string) => store.find((i) => i.name === name) as PantryIngredient;
const groupOf = (id: string) => [garnish, pantry].find((c) => c.id === id) as Category;

/** A small fake of the pantry API: pages of `pageSize`, and a duplicate-name check. */
function useFakeApi(pageSize = 200, tree = [garnish, pantry]) {
  server.use(
    http.get(treeUrl, () =>
      HttpResponse.json({ items: tree.map((c) => ({ ...c, children: [] })) }),
    ),
    http.get(url, ({ request }) => {
      const start = Number(new URL(request.url).searchParams.get("cursor") ?? 0);
      const sorted = [...store].sort((a, b) => a.name.localeCompare(b.name));
      const next = start + pageSize < sorted.length ? String(start + pageSize) : null;
      return HttpResponse.json({ items: sorted.slice(start, start + pageSize), next_cursor: next });
    }),
    http.post(url, async ({ request }) => {
      const body = (await request.json()) as Partial<PantryIngredient> & {
        name: string;
        category_id: string;
      };
      requests.push({ method: "POST", body });
      if (store.some((i) => i.name === body.name && i.category_id === body.category_id)) {
        const message = `An ingredient named "${body.name}" already exists in this category`;
        return HttpResponse.json(
          { error: { code: "CONFLICT", message, details: [{ path: ["name"], message }] } },
          { status: 409 },
        );
      }
      const created = ingredient(body.name, groupOf(body.category_id), body);
      store.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${url}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<PantryIngredient>;
      requests.push({ method: "PATCH", body });
      store = store.map((i) =>
        i.id === params.id
          ? {
              ...i,
              ...body,
              category_name: groupOf(body.category_id ?? i.category_id).name,
            }
          : i,
      );
      return HttpResponse.json(store.find((i) => i.id === params.id));
    }),
    http.delete(`${url}/:id`, ({ params }) => {
      requests.push({ method: "DELETE" });
      store = store.filter((i) => i.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

beforeEach(() => {
  store = [
    ingredient("Lemon", garnish),
    ingredient("Mint", garnish, { in_stock: true }),
    ingredient("Ice", pantry, { always_available: true }),
    ingredient("Egg", pantry),
  ];
  requests = [];
  useFakeApi();
});

const rows = (name: string) =>
  within(screen.getByRole("list", { name }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
const stockButton = (name: string) => screen.getByRole("button", { name: `${name} in stock` });

async function open(path = "/pantry") {
  const view = renderWithProviders(path);
  await screen.findByRole("list", { name: "Garnish" });
  return view;
}

describe("PantryPage", () => {
  it("groups ingredients by category, showing stock and staples distinctly", async () => {
    await open();
    expect(rows("Garnish")).toEqual(["LemonOut of stock", "MintIn stock"]);
    expect(rows("Pantry")).toEqual(["EggOut of stock", "IceAlways available"]);
    expect(stockButton("Mint")).toHaveAttribute("aria-pressed", "true");
    expect(stockButton("Lemon")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Ice in stock" })).not.toBeInTheDocument();
  });

  it("heads each group with its category path, keeping same-named sub-categories apart", async () => {
    const juice = category("Juice");
    const citrus = (parent: Category) => ({ ...category("Citrus"), parent_id: parent.id });
    const garnishCitrus = citrus(garnish);
    const juiceCitrus = citrus(juice);
    store = [ingredient("Yuzu", garnishCitrus), ingredient("Yuzu juice", juiceCitrus)];
    server.use(
      http.get(treeUrl, () =>
        HttpResponse.json({
          items: [
            { ...garnish, children: [{ ...garnishCitrus, children: [] }] },
            { ...juice, children: [{ ...juiceCitrus, children: [] }] },
          ],
        }),
      ),
    );
    renderWithProviders("/pantry");
    expect(await screen.findByRole("list", { name: "Garnish › Citrus" })).toHaveTextContent("Yuzu");
    expect(rows("Juice › Citrus")).toEqual(["Yuzu juiceOut of stock"]);
  });

  it("keeps a stock tap that lands after the list left the cache", async () => {
    server.use(
      http.patch(`${url}/:id`, async () => {
        await delay(30);
        return HttpResponse.json({ ...byName("Lemon"), in_stock: true });
      }),
    );
    const { user, queryClient } = await open();
    await user.click(stockButton("Lemon"));
    queryClient.removeQueries({ queryKey: ["bars", BAR_ID, "pantry"] });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(screen.queryByText("Could not update Lemon")).not.toBeInTheDocument();
  });

  it("restocks a lemon in one tap, and keeps it after revisiting the screen", async () => {
    const { user } = await open();
    await user.click(stockButton("Lemon"));
    await waitFor(() => expect(stockButton("Lemon")).toHaveAttribute("aria-pressed", "true"));
    expect(requests).toEqual([{ method: "PATCH", body: { in_stock: true } }]);

    const nav = screen.getByRole("navigation", { name: "Bottom navigation" });
    await user.click(within(nav).getByRole("link", { name: "Bottles" }));
    await screen.findByRole("heading", { name: "Bottles" });
    await user.click(within(nav).getByRole("link", { name: "Pantry" }));
    await screen.findByRole("list", { name: "Garnish" });
    expect(stockButton("Lemon")).toHaveAttribute("aria-pressed", "true");
    expect(byName("Lemon").in_stock).toBe(true);
  });

  it("recovers after a failed update", async () => {
    let fail = true;
    server.use(
      http.patch(`${url}/:id`, async () => {
        if (!fail) return;
        await delay(10);
        return HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 });
      }),
    );
    const { user } = await open();
    await user.click(stockButton("Lemon"));
    expect(await screen.findByText("Could not update Lemon")).toBeInTheDocument();
    expect(stockButton("Lemon")).toHaveAttribute("aria-pressed", "false");
    expect(stockButton("Lemon")).toBeEnabled();

    fail = false;
    await user.click(stockButton("Lemon"));
    await waitFor(() => expect(stockButton("Lemon")).toHaveAttribute("aria-pressed", "true"));
    expect(byName("Lemon").in_stock).toBe(true);
  });

  it("loads more pages", async () => {
    useFakeApi(3);
    const { user } = renderWithProviders("/pantry");
    await screen.findByRole("list", { name: "Garnish" });
    expect(screen.queryByText("Mint")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Mint")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows an empty state, and a load error with a retry", async () => {
    let fail = true;
    server.use(
      http.get(url, () =>
        fail
          ? HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 })
          : HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );
    const { user } = renderWithProviders("/pantry");
    expect(await screen.findByRole("alert")).toHaveTextContent("Down");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("The pantry is empty")).toBeInTheDocument();
  });

  it("shows viewers the stock without edit actions", async () => {
    server.use(
      http.get("/api/me", () =>
        HttpResponse.json({ ...meFixture, bars: [{ ...meFixture.bars[0], role: "viewer" }] }),
      ),
    );
    await open();
    expect(rows("Garnish")).toEqual(["LemonOut of stock", "MintIn stock"]);
    expect(screen.queryByRole("button", { name: "Lemon in stock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add ingredient" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Lemon" })).not.toBeInTheDocument();
  });

  it("deletes an ingredient after confirmation", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Delete Egg" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Egg?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deleted Egg")).toBeInTheDocument();
    await waitFor(() => expect(rows("Pantry")).toEqual(["IceAlways available"]));
    await user.click(screen.getByRole("button", { name: "Delete Ice" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(store).toHaveLength(3);
  });
});

describe("IngredientSheet", () => {
  it("adds an ingredient under Pantry by default and offers only relevant categories", async () => {
    useFakeApi(200, [
      garnish,
      pantry,
      { ...category("Syrup"), kind: "syrup" },
      { ...category("Gin"), kind: "spirit" },
      { ...category("Juice"), kind: "juice" },
    ]);
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    const sheet = await screen.findByRole("dialog", { name: "New ingredient" });
    const picker = await within(sheet).findByRole("combobox", { name: "Category" });
    expect(picker).toHaveTextContent("Pantry");
    await user.click(picker);
    expect(await screen.findByRole("option", { name: "Syrup" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Gin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Juice" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.type(within(sheet).getByLabelText("Name"), "Honey");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Ingredient added")).toBeInTheDocument();
    expect(requests[0]?.body).toEqual({
      name: "Honey",
      category_id: pantry.id,
      in_stock: true,
      always_available: false,
    });
    await waitFor(() => expect(rows("Pantry")).toContain("HoneyIn stock"));
  });

  it("asks for a category when the bar has no Pantry grouping", async () => {
    useFakeApi(200, [garnish]);
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    const sheet = await screen.findByRole("dialog", { name: "New ingredient" });
    await user.type(await within(sheet).findByLabelText("Name"), "Yuzu");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await within(sheet).findByText("Choose a category")).toBeInTheDocument();
    await choose(user, "Category", "Garnish");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Ingredient added")).toBeInTheDocument();
    expect(requests[0]?.body).toMatchObject({ name: "Yuzu", category_id: garnish.id });
  });

  it("sets and clears the staple setting", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Edit Egg" }));
    let sheet = await screen.findByRole("dialog", { name: "Edit Egg" });
    await user.click(await within(sheet).findByLabelText(/Always available/));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Ingredient saved")).toBeInTheDocument();
    expect(requests[0]?.body).toEqual({
      name: "Egg",
      category_id: pantry.id,
      in_stock: false,
      always_available: true,
    });
    await waitFor(() =>
      expect(rows("Pantry")).toEqual(["EggAlways available", "IceAlways available"]),
    );

    await user.click(screen.getByRole("button", { name: "Edit Ice" }));
    sheet = await screen.findByRole("dialog", { name: "Edit Ice" });
    const staple = await within(sheet).findByLabelText(/Always available/);
    expect(staple).toBeChecked();
    await user.click(staple);
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rows("Pantry")).toContain("IceOut of stock"));
    expect(byName("Ice").always_available).toBe(false);
  });

  it("shows a duplicate name on the field and other errors in a toast", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    const sheet = await screen.findByRole("dialog", { name: "New ingredient" });
    await user.type(await within(sheet).findByLabelText("Name"), "Egg");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(
      await within(sheet).findByText('An ingredient named "Egg" already exists in this category'),
    ).toBeInTheDocument();

    server.use(
      http.post(url, () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "Disk full" } }, { status: 500 }),
      ),
    );
    await user.clear(within(sheet).getByLabelText("Name"));
    await user.type(within(sheet).getByLabelText("Name"), "Salt");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Could not save the ingredient")).toBeInTheDocument();
    expect(store).toHaveLength(4);
  });

  it("waits for the categories, and offers a retry when they fail to load", async () => {
    let fail = true;
    const { promise: loading, resolve: finishLoading } = Promise.withResolvers<void>();
    server.use(
      http.get(treeUrl, async () => {
        await loading;
        return fail
          ? HttpResponse.json({ error: { code: "INTERNAL", message: "No tree" } }, { status: 500 })
          : HttpResponse.json({ items: [{ ...pantry, children: [] }] });
      }),
    );
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    const sheet = await screen.findByRole("dialog", { name: "New ingredient" });
    try {
      expect(within(sheet).getByText("Loading categories…")).toBeInTheDocument();
    } finally {
      finishLoading();
    }
    expect(await within(sheet).findByText("No tree")).toBeInTheDocument();
    fail = false;
    await user.click(within(sheet).getByRole("button", { name: "Try again" }));
    expect(await within(sheet).findByLabelText("Category")).toHaveTextContent("Pantry");
  });

  it("closes without saving", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await screen.findByRole("dialog", { name: "New ingredient" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests).toEqual([]);
  });
});
