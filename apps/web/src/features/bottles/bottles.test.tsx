import { buildTree, type Category, type Product, type Purchase, subtreeIds } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { localToday } from "@/lib/dates.ts";
import { failure, fixtureId as id, page, timestamps } from "@/test/fixtures.ts";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { choose, renderWithProviders } from "@/test/render.tsx";

const url = `/api/bars/${BAR_ID}/products`;

const category = (n: number, name: string, parent: Category | null = null): Category => ({
  id: id(n),
  name,
  parent_id: parent?.id ?? null,
  kind: "spirit",
  default_abv: 40,
  description: null,
  image_id: null,
  ...timestamps,
});
const spirit = category(1, "Spirit");
const whisky = category(2, "Whisky", spirit);
const scotch = category(3, "Scotch", whisky);
const gin = category(4, "Gin", spirit);
const syrup = { ...category(5, "Syrup"), kind: "syrup" as const };
const juice = { ...category(6, "Juice"), kind: "juice" as const };
const categories = [spirit, whisky, scotch, gin, syrup, juice];

let seq = 100;
const product = (name: string, cat: Category, extra: Partial<Product> = {}): Product => ({
  id: id(++seq),
  name,
  category_id: cat.id,
  category_name: cat.name,
  producer: null,
  country: null,
  region: null,
  abv: null,
  vintage: null,
  age_years: null,
  description: null,
  image_id: null,
  status: "tasted",
  stock: { open_count: 0, total_count: 0, last_bought_on: null, last_finished_on: null },
  tasting_summary: { count: 0, avg_score: null, last_tasted_on: null },
  is_favourite: false,
  comment_count: 0,
  ...timestamps,
  ...extra,
});

let store: Product[] = [];
let purchases: Purchase[] = [];
let requests: { method: string; path: string; body?: unknown }[] = [];
const PAGE = 2;

const conflict = (message: string) =>
  failure("CONFLICT", 409, message, [{ path: ["name"], message }]);

const purchase = (productId: string, extra: Partial<Purchase> = {}): Purchase => ({
  id: id(++seq),
  product_id: productId,
  bought_on: "2026-11-01",
  price_minor: null,
  currency: null,
  store: null,
  notes: null,
  finished_on: null,
  ...timestamps,
  ...extra,
});

function setProduct(productId: string, change: Partial<Product>) {
  store = store.map((p) => (p.id === productId ? { ...p, ...change } : p));
  return store.find((p) => p.id === productId);
}

/** A small fake of the products API: filters, two-item pages, and a duplicate-name check. */
function useFakeApi() {
  const save = (body: Record<string, unknown>, existing?: Product) => {
    const cat = categories.find((c) => c.id === (body.category_id ?? existing?.category_id));
    return { ...(existing ?? product("", spirit)), ...body, category_name: cat?.name } as Product;
  };
  server.use(
    http.get(`/api/bars/${BAR_ID}/categories/tree`, () =>
      HttpResponse.json({ items: buildTree(categories) }),
    ),
    http.get(url, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const q = params.get("q")?.toLowerCase();
      const cat = params.get("category_id");
      const statuses = params.get("status")?.split(",");
      const country = params.get("country");
      const ids = cat ? subtreeIds(categories, cat) : null;
      const matches = [...store]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((p) => !q || p.name.toLowerCase().includes(q))
        .filter((p) => !ids || ids.has(p.category_id))
        .filter((p) => !country || p.country === country)
        .filter((p) => !statuses || statuses.includes(p.status ?? "none"));
      const start = Number(params.get("cursor") ?? 0);
      const next = start + PAGE < matches.length ? String(start + PAGE) : null;
      return HttpResponse.json({ items: matches.slice(start, start + PAGE), next_cursor: next });
    }),
    http.get(`${url}/:id`, ({ params }) => {
      const found = store.find((p) => p.id === params.id);
      if (found) return HttpResponse.json(found);
      return failure("NOT_FOUND", 404, "Product not found");
    }),
    http.post(url, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      requests.push({ method: "POST", path: "", body });
      if (store.some((p) => p.name === body.name)) {
        return conflict(`A bottle named "${body.name}" already exists`);
      }
      const created = save(body);
      store.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${url}/:id/status`, async ({ request, params }) => {
      const body = (await request.json()) as Pick<Product, "status">;
      requests.push({ method: "PATCH", path: "status", body });
      return HttpResponse.json(setProduct(params.id as string, body));
    }),
    http.post(`${url}/:id/finish`, async ({ request, params }) => {
      const body = (await request.json()) as { finished_on: string };
      requests.push({ method: "POST", path: "finish", body });
      return HttpResponse.json(setProduct(params.id as string, { status: "finished" }));
    }),
    http.get(`${url}/:id/purchases`, ({ params }) =>
      HttpResponse.json({ items: purchases.filter((p) => p.product_id === params.id) }),
    ),
    http.post(`${url}/:id/purchases`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown> & { count: number };
      requests.push({ method: "POST", path: "purchases", body });
      setProduct(params.id as string, { status: "owned" });
      const items = Array.from({ length: body.count }, () =>
        purchase(params.id as string, body as Partial<Purchase>),
      );
      purchases = [...items, ...purchases];
      return HttpResponse.json({ items }, { status: 201 });
    }),
    http.patch(`${url}/:id/purchases/:purchaseId`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<Purchase>;
      requests.push({ method: "PATCH", path: "purchase", body });
      purchases = purchases.map((p) => (p.id === params.purchaseId ? { ...p, ...body } : p));
      return HttpResponse.json(purchases.find((p) => p.id === params.purchaseId));
    }),
    http.delete(`${url}/:id/purchases/:purchaseId`, ({ params }) => {
      requests.push({ method: "DELETE", path: "purchase" });
      purchases = purchases.filter((p) => p.id !== params.purchaseId);
      return new HttpResponse(null, { status: 204 });
    }),
    http.patch(`${url}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      requests.push({ method: "PATCH", path: "", body });
      store = store.map((p) => (p.id === params.id ? save(body, p) : p));
      return HttpResponse.json(store.find((p) => p.id === params.id));
    }),
    http.delete(`${url}/:id`, ({ params }) => {
      requests.push({ method: "DELETE", path: params.id as string });
      store = store.filter((p) => p.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

beforeEach(() => {
  store = [
    product("Talisker 10", scotch, {
      producer: "Diageo",
      status: "owned",
      abv: 45.8,
      age_years: 10,
    }),
    product("Blended whisky", whisky),
    product("Hendrick's", gin, { status: "owned" }),
  ];
  purchases = [];
  requests = [];
  useFakeApi();
});

const list = () => screen.getByRole("list", { name: "Bottles" });
const names = () =>
  within(list())
    .getAllByRole("link")
    .map((a) => a.textContent);
const byName = (name: string) => store.find((p) => p.name === name) as Product;
/** The status dropdown of a bottle, on the list or its page. */
const statusOf = (name: string) =>
  screen.getByRole("button", { name: (accessible) => accessible.startsWith(`Status of ${name}:`) });
/** Opens a bottle's status dropdown and picks `item` in it. */
async function openStock(
  user: ReturnType<typeof renderWithProviders>["user"],
  name: string,
  item: string,
) {
  await user.click(
    await screen.findByRole("button", {
      name: (accessible) => accessible.startsWith(`Status of ${name}:`),
    }),
  );
  await user.click(await screen.findByRole("button", { name: item }));
}

async function openList(path = "/bottles") {
  const view = renderWithProviders(path);
  await screen.findByRole("list", { name: "Bottles" });
  return view;
}

function asViewer() {
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({ ...meFixture, bars: [{ ...meFixture.bars[0], role: "viewer" }] }),
    ),
  );
}

describe("BottlesPage", () => {
  it("lists bottles by name with their category, and loads more", async () => {
    const { user } = await openList();
    expect(names()).toEqual(["Blended whisky", "Hendrick's"]);
    expect(within(list()).getByText("Whisky")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(names()).toEqual(["Blended whisky", "Hendrick's", "Talisker 10"]));
    expect(within(list()).getByText("Scotch · Diageo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("filters by search, category including children, and statuses, kept in the URL", async () => {
    store.push(product("Ardbeg 10", scotch, { status: null }));
    const { user, router } = await openList();
    const chip = (name: string) => screen.getByRole("checkbox", { name });
    await choose(user, "Category", "Whisky");
    await waitFor(() => expect(names()).toEqual(["Ardbeg 10", "Blended whisky"]));
    await user.click(chip("Owned"));
    await waitFor(() => expect(names()).toEqual(["Talisker 10"]));
    expect(router.state.location.search).toEqual({ category: whisky.id, status: ["owned"] });
    await user.click(chip("No status"));
    await waitFor(() => expect(names()).toEqual(["Ardbeg 10", "Talisker 10"]));
    expect(router.state.location.search).toMatchObject({ status: ["owned", "none"] });

    await choose(user, "Category", "All categories");
    await user.click(chip("Owned"));
    await user.click(chip("Tasted"));
    await waitFor(() => expect(names()).toEqual(["Ardbeg 10", "Blended whisky"]));
    expect(router.state.location.search).toEqual({ status: ["tasted", "none"] });
    await user.type(screen.getByRole("searchbox", { name: "Search bottles" }), "blend");
    await waitFor(() => expect(names()).toEqual(["Blended whisky"]));
    await user.clear(screen.getByRole("searchbox", { name: "Search bottles" }));
    await user.click(chip("Tasted"));
    await user.click(chip("No status"));
    await waitFor(() => expect(names()).toHaveLength(2));
    expect(router.state.location.search).toEqual({});
  });

  it("shows the country name, not the code, and filters by country", async () => {
    store.push(product("Akashi", whisky, { country: "JP" }));
    store.push(product("Ardbeg 10", scotch, { country: "GB", region: "Islay" }));
    const { user, router } = await openList();
    await waitFor(() => expect(within(list()).getByText("Whisky · Japan")).toBeInTheDocument());
    expect(screen.queryByText("JP")).not.toBeInTheDocument();

    await choose(user, "Country", "Japan");
    await waitFor(() => expect(names()).toEqual(["Akashi"]));
    expect(router.state.location.search).toEqual({ country: "JP" });
    await choose(user, "Country", "United Kingdom");
    await waitFor(() => expect(names()).toEqual(["Ardbeg 10"]));
    await choose(user, "Country", "All countries");
    await waitFor(() => expect(names()).toHaveLength(2));
    expect(router.state.location.search).toEqual({});
  });

  it("explains an empty country filter", async () => {
    renderWithProviders("/bottles?country=FR");
    expect(await screen.findByText("No bottles match")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Country" })).toHaveTextContent("France");
  });

  it("drops a country that is not a code from the URL", async () => {
    await openList("/bottles?country=Japan");
    expect(names()).toEqual(["Blended whisky", "Hendrick's"]);
    expect(screen.getByRole("combobox", { name: "Country" })).toHaveTextContent("All countries");
  });

  it("reads filters from the URL and ignores bad ones", async () => {
    await openList(`/bottles?status=${encodeURIComponent('["maybe"]')}&category=${gin.id}`);
    await waitFor(() => expect(names()).toEqual(["Hendrick's"]));
    expect(screen.getByRole("checkbox", { name: "Owned" })).not.toBeChecked();
  });

  it("drops a malformed category from the URL instead of failing", async () => {
    await openList("/bottles?category=abc");
    expect(names()).toEqual(["Blended whisky", "Hendrick's"]);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("All categories");
  });

  it("clears the search box when the search is cleared elsewhere", async () => {
    const { user, router } = await openList();
    const box = screen.getByRole("searchbox", { name: "Search bottles" });
    await user.type(box, "hend");
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "hend" }));
    await user.click(screen.getAllByRole("link", { name: "Bottles" })[0] as HTMLElement);
    await waitFor(() => expect(box).toHaveValue(""));
    // Longer than the search pause: the old text is not pushed back into the URL.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(router.state.location.search).toEqual({});
    expect(names()).toEqual(["Blended whisky", "Hendrick's"]);
  });

  it("marks a bottle bought without a price: one bottle, today, in the bar", async () => {
    const { user } = await openList();
    await openStock(user, "Blended whisky", "Bought a bottle…");
    const sheet = await screen.findByRole("dialog", { name: "Bought" });
    expect(within(sheet).getByLabelText("Date")).toHaveValue(localToday());
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Added the bottle")).toBeInTheDocument();
    expect(requests).toEqual([
      {
        method: "POST",
        path: "purchases",
        body: { bought_on: localToday(), price_minor: null, count: 1, store: null, notes: null },
      },
    ]);
    await waitFor(() => expect(statusOf("Blended whisky")).toHaveTextContent("Owned"));
    await openStock(user, "Blended whisky", "Ran out…");
    expect(await screen.findByRole("dialog", { name: "Ran out of Blended whisky?" })).toBeVisible();
  });

  it("buys 2 bottles with a price in the bar's currency, or in another one", async () => {
    store.push(product("Akashi", whisky));
    const { user } = await openList();
    await openStock(user, "Blended whisky", "Bought a bottle…");
    let sheet = await screen.findByRole("dialog", { name: "Bought" });
    expect(within(sheet).getByText("Blended whisky")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Currency")).toHaveTextContent("JPY");
    await user.type(within(sheet).getByLabelText("Price per bottle"), "4500");
    await user.clear(within(sheet).getByLabelText("Number of bottles"));
    await user.type(within(sheet).getByLabelText("Number of bottles"), "2");
    await user.type(within(sheet).getByLabelText("Store"), "Liquor shop");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Added 2 bottles")).toBeInTheDocument();
    expect(requests[0]?.body).toMatchObject({
      price_minor: 4500,
      currency: "JPY",
      count: 2,
      store: "Liquor shop",
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openStock(user, "Akashi", "Bought a bottle…");
    sheet = await screen.findByRole("dialog", { name: "Bought" });
    await choose(user, "Currency", /^USD/);
    await user.type(within(sheet).getByLabelText("Price per bottle"), "19.99");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.body).toMatchObject({ price_minor: 1999, currency: "USD", count: 1 });
  });

  it("refuses a price the currency cannot hold exactly, and an empty bottle count", async () => {
    const { user } = await openList();
    await openStock(user, "Blended whisky", "Bought a bottle…");
    const sheet = await screen.findByRole("dialog", { name: "Bought" });
    const price = within(sheet).getByLabelText("Price per bottle");
    const add = within(sheet).getByRole("button", { name: "Add" });
    await user.type(price, "4500.5");
    await user.click(add);
    expect(await within(sheet).findByText("Enter a whole amount in JPY")).toBeInTheDocument();
    await user.clear(price);
    await user.type(price, "1e20");
    await user.click(add);
    expect(await within(sheet).findByText("This price is too large")).toBeInTheDocument();
    await choose(user, "Currency", /^USD/);
    await user.clear(price);
    await user.type(price, "19.999");
    await user.click(add);
    expect(await within(sheet).findByText("Use at most 2 decimals")).toBeInTheDocument();
    await user.clear(price);
    await user.clear(within(sheet).getByLabelText("Number of bottles"));
    await user.click(add);
    expect(await within(sheet).findByText("Enter how many bottles")).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it("marks an owned bottle as run out after confirming the date", async () => {
    const { user } = await openList();
    await openStock(user, "Hendrick's", "Ran out…");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests).toEqual([]);
    await openStock(user, "Hendrick's", "Ran out…");
    const sheet = await screen.findByRole("dialog", { name: "Ran out of Hendrick's?" });
    expect(within(sheet).getByText("The bottle is marked as finished.")).toBeInTheDocument();
    const date = within(sheet).getByLabelText("Ran out on");
    expect(date).toHaveValue(localToday());
    await user.clear(date);
    await user.type(date, "2026-11-15");
    await user.click(within(sheet).getByRole("button", { name: "Ran out" }));
    expect(await screen.findByText("Ran out of Hendrick's")).toBeInTheDocument();
    expect(requests).toEqual([
      { method: "POST", path: "finish", body: { finished_on: "2026-11-15" } },
    ]);
    await waitFor(() => expect(statusOf("Hendrick's")).toHaveTextContent("Finished"));
    await user.click(statusOf("Hendrick's"));
    expect(screen.queryByRole("button", { name: "Ran out…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finished" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the sheet open with a toast when an update fails, and recovers on retry", async () => {
    byName("Hendrick's").stock = { ...byName("Hendrick's").stock, open_count: 2 };
    let fail = true;
    server.use(
      http.post(`${url}/:id/finish`, ({ params }) =>
        fail
          ? failure("INTERNAL", 500, "Boom")
          : HttpResponse.json(setProduct(params.id as string, { status: "finished" })),
      ),
    );
    const { user } = await openList();
    const row = screen.getByRole("link", { name: "Hendrick's" }).closest("li") as HTMLElement;
    await openStock(user, "Hendrick's", "Ran out…");
    const sheet = await screen.findByRole("dialog", { name: "Ran out of Hendrick's?" });
    expect(within(sheet).getByText(/oldest of 2 open bottles/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Ran out" }));
    expect(await screen.findByText("Could not update the bottle")).toBeInTheDocument();
    expect(sheet).toBeInTheDocument();
    // The open sheet hides the rest of the page from queries that skip hidden elements.
    expect(
      within(row).getByRole("button", { hidden: true, name: /^Status of Hendrick's/ }),
    ).toHaveTextContent("Owned");
    fail = false;
    await user.click(within(sheet).getByRole("button", { name: "Ran out" }));
    await waitFor(() => expect(statusOf("Hendrick's")).toHaveTextContent("Finished"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a toast when buying fails", async () => {
    server.use(http.post(`${url}/:id/purchases`, () => failure("INTERNAL", 500, "Boom")));
    const { user } = await openList();
    await openStock(user, "Blended whisky", "Bought a bottle…");
    const sheet = await screen.findByRole("dialog", { name: "Bought" });
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Could not save the purchase")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Bought" })).toBeInTheDocument();
  });

  it("updates the shown list in place while a new search is still loading", async () => {
    const { user, router } = await openList();
    server.use(
      http.get(url, async ({ request }) => {
        if (new URL(request.url).searchParams.has("q")) await delay("infinite");
      }),
    );
    await user.type(screen.getByRole("searchbox", { name: "Search bottles" }), "zz");
    // Let the search pause pass, so the new (never answered) list query exists.
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "zz" }));
    expect(names()).toEqual(["Blended whisky", "Hendrick's"]);
    const row = screen.getByRole("link", { name: "Hendrick's" }).closest("li") as HTMLElement;
    await openStock(user, "Hendrick's", "Ran out…");
    const sheet = await screen.findByRole("dialog", { name: "Ran out of Hendrick's?" });
    await user.click(within(sheet).getByRole("button", { name: "Ran out" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(byName("Hendrick's").status).toBe("finished");
    expect(row).toBeInTheDocument();
  });

  it("shows viewers each status without stock actions, and no badge without a status", async () => {
    asViewer();
    store.push(product("Zubrowka", gin, { status: null }));
    const { user } = await openList();
    expect(screen.queryByRole("button", { name: "Add bottle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Status of/ })).not.toBeInTheDocument();
    expect(within(list()).getByText("Owned")).toBeInTheDocument();
    expect(within(list()).getByText("Tasted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(names()).toHaveLength(4));
    expect(within(list()).getAllByText(/^(Owned|Tasted|Finished)$/)).toHaveLength(3);
  });

  it("shows empty states with and without filters", async () => {
    store = [];
    renderWithProviders("/bottles");
    expect(await screen.findByText("No bottles yet")).toBeInTheDocument();
    renderWithProviders("/bottles?q=zzz");
    expect(await screen.findByText("No bottles match")).toBeInTheDocument();
  });

  it("shows a load error and retries", async () => {
    let fail = true;
    server.use(http.get(url, () => (fail ? failure("INTERNAL", 500, "Down") : page([]))));
    const { user, queryClient } = renderWithProviders("/bottles");
    queryClient.setDefaultOptions({ queries: { retry: false } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Down");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No bottles yet")).toBeInTheDocument();
  });

  it("shows loading while the bar is unknown, and a message without a bar", async () => {
    server.use(http.get("/api/me", async () => delay("infinite")));
    renderWithProviders("/bottles");
    expect(await screen.findByRole("status")).toBeInTheDocument();
    server.use(http.get("/api/me", () => HttpResponse.json({ ...meFixture, bars: [] })));
    renderWithProviders("/bottles/x");
    expect(await screen.findByText("You are not a member of any bar yet.")).toBeInTheDocument();
  });
});

describe("ProductSheet", () => {
  it("adds a bottle, checking the category first", async () => {
    const { user } = await openList();
    await user.click(screen.getByRole("button", { name: "Add bottle" }));
    const sheet = await screen.findByRole("dialog", { name: "New bottle" });
    await user.click(await within(sheet).findByLabelText("Category"));
    expect(await screen.findByRole("option", { name: "Juice" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Syrup" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.type(within(sheet).getByLabelText("Name"), "Ardbeg 10");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await within(sheet).findByText("Choose a category")).toBeInTheDocument();
    expect(requests).toEqual([]);

    await choose(user, "Category", "Scotch");
    await user.type(within(sheet).getByLabelText("Producer"), "Ardbeg");
    await user.type(within(sheet).getByLabelText("ABV (%)"), "46");
    await user.type(within(sheet).getByLabelText("Age (years)"), "10");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests[0]?.body).toEqual({
      name: "Ardbeg 10",
      category_id: scotch.id,
      producer: "Ardbeg",
      country: null,
      region: null,
      abv: 46,
      vintage: null,
      age_years: 10,
      description: null,
      status: "owned",
    });
    expect(await screen.findByText("Bottle added")).toBeInTheDocument();
  });

  it("finds a country by a partial, accent-free name and saves its code", async () => {
    store.push(product("Hibiki", whisky));
    const { user } = await openList();
    await user.click(screen.getByRole("button", { name: "Add bottle" }));
    const sheet = await screen.findByRole("dialog", { name: "New bottle" });
    await user.type(within(sheet).getByLabelText("Name"), "Nikka");
    await choose(user, "Category", "Scotch");
    await user.click(within(sheet).getByLabelText("Country"));
    expect(screen.getByRole("option", { name: "No country" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search countries"), "JAP");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.click(screen.getByRole("option", { name: "Japan" }));
    expect(within(sheet).getByLabelText("Country")).toHaveTextContent("Japan");
    await user.type(within(sheet).getByLabelText("Region"), "Hokkaido");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toMatchObject({ country: "JP", region: "Hokkaido" });
  });

  it("shows a duplicate name on the field and other errors in a toast", async () => {
    const { user } = await openList();
    await user.click(screen.getByRole("button", { name: "Add bottle" }));
    const sheet = await screen.findByRole("dialog", { name: "New bottle" });
    await user.type(within(sheet).getByLabelText("Name"), "Hendrick's");
    await choose(user, "Category", "Gin");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(
      await within(sheet).findByText(`A bottle named "Hendrick's" already exists`),
    ).toBeInTheDocument();

    server.use(http.post(url, () => failure("INTERNAL", 500, "Disk full")));
    await user.clear(within(sheet).getByLabelText("Name"));
    await user.type(within(sheet).getByLabelText("Name"), "Other");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Could not save the bottle")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New bottle" })).toBeInTheDocument();
  });
});

describe("ProductSheet without categories", () => {
  it("shows the load error with a retry, and closes without saving", async () => {
    let fail = true;
    server.use(
      http.get(`/api/bars/${BAR_ID}/categories/tree`, () =>
        fail
          ? failure("INTERNAL", 500, "Down")
          : HttpResponse.json({ items: buildTree(categories) }),
      ),
    );
    const { user, queryClient } = await openList();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    await user.click(screen.getByRole("button", { name: "Add bottle" }));
    const sheet = await screen.findByRole("dialog", { name: "New bottle" });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Down");
    expect(within(sheet).queryByLabelText("Category")).not.toBeInTheDocument();
    fail = false;
    await user.click(within(sheet).getByRole("button", { name: "Try again" }));
    expect(await within(sheet).findByLabelText("Category")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests).toEqual([]);
  });
});

describe("BottleDetailPage", () => {
  async function openDetail(name = "Talisker 10", tab?: string) {
    const view = renderWithProviders(`/bottles/${byName(name).id}${tab ? `?tab=${tab}` : ""}`);
    await screen.findByRole("heading", { name });
    return view;
  }

  it("opens from the list and shows the bottle's details", async () => {
    const { user } = await openList();
    await user.click(screen.getByRole("link", { name: "Hendrick's" }));
    expect(await screen.findByRole("heading", { name: "Hendrick's" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "All bottles" }));
    expect(await screen.findByRole("list", { name: "Bottles" })).toBeInTheDocument();
  });

  it("switches between tabs, keeping the open one in the URL", async () => {
    const { user, router } = await openDetail();
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Stock" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Stock" }));
    expect(await screen.findByRole("region", { name: "Stock" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ tab: "stock" });
    await user.click(screen.getByRole("tab", { name: "Tastings" }));
    expect(await screen.findByText("Not tasted yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Details" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.getByText("45.8%")).toBeInTheDocument();
  });

  it("lists only the facts that are set", async () => {
    byName("Talisker 10").description = "Peaty";
    await openDetail();
    const facts = screen.getAllByRole("term")[0]?.closest("dl") as HTMLElement;
    expect(
      within(facts)
        .getAllByRole("term")
        .map((t) => t.textContent),
    ).toEqual(["Category", "Producer", "ABV", "Age"]);
    expect(within(facts).getByText("45.8%")).toBeInTheDocument();
    expect(within(facts).getByText("10 years")).toBeInTheDocument();
    expect(screen.getByText("Peaty")).toBeInTheDocument();
  });

  it("shows the stock and the purchase history newest first, with JPY and USD prices", async () => {
    const talisker = byName("Talisker 10");
    talisker.stock = {
      open_count: 1,
      total_count: 3,
      last_bought_on: "2026-10-01",
      last_finished_on: "2026-09-20",
    };
    purchases = [
      purchase(talisker.id, { bought_on: "2026-10-01", price_minor: 4500, currency: "JPY" }),
      purchase(talisker.id, {
        bought_on: "2026-06-01",
        price_minor: 1999,
        currency: "USD",
        store: "Airport",
        notes: "Duty free",
        finished_on: "2026-09-20",
      }),
      purchase(talisker.id, { bought_on: "2026-01-01", price_minor: 4500, currency: "JPY" }),
    ];
    await openDetail("Talisker 10", "stock");
    expect(await screen.findByText("¥9,000 + $19.99")).toBeInTheDocument();
    const stock = screen
      .getAllByRole("term")
      .map((t) => [t.textContent, t.nextSibling?.textContent]);
    expect(stock).toEqual(
      expect.arrayContaining([
        ["Open bottles", "1"],
        ["Last bought", "Oct 1, 2026"],
        ["Last ran out", "Sep 20, 2026"],
        ["Total spent", "¥9,000 + $19.99"],
      ]),
    );
    const history = await screen.findByRole("list", { name: "Purchases" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
      "Oct 1, 2026 · ¥4,500",
      "Jun 1, 2026 · $19.99",
      "Jan 1, 2026 · ¥4,500",
    ]);
    expect(
      within(rows[1] as HTMLElement).getByText("Airport · Ran out Sep 20, 2026"),
    ).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText("Duty free")).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByText("Open")).toBeVisible();
  });

  it("edits, reopens and deletes purchases", async () => {
    const talisker = byName("Talisker 10");
    purchases = [
      purchase(talisker.id, { finished_on: "2026-11-05", price_minor: 2500, currency: "USD" }),
    ];
    const { user } = await openDetail("Talisker 10", "stock");
    const history = await screen.findByRole("list", { name: "Purchases" });
    await user.click(within(history).getByRole("button", { name: "Edit purchase of Nov 1, 2026" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit purchase" });
    expect(within(sheet).getByLabelText("Price per bottle")).toHaveValue(25);
    expect(within(sheet).getByLabelText("Ran out on")).toHaveValue("2026-11-05");
    await user.type(within(sheet).getByLabelText("Store"), "Corner shop");
    await user.clear(within(sheet).getByLabelText("Price per bottle"));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Purchase saved")).toBeInTheDocument();
    expect(requests.at(-1)).toEqual({
      method: "PATCH",
      path: "purchase",
      body: {
        bought_on: "2026-11-01",
        price_minor: null,
        store: "Corner shop",
        notes: null,
        finished_on: "2026-11-05",
      },
    });

    await user.click(await within(history).findByRole("button", { name: "Reopen" }));
    expect(await screen.findByText("Bottle reopened")).toBeInTheDocument();
    expect(requests.at(-1)?.body).toEqual({ finished_on: null });
    await waitFor(() => expect(within(history).getByText(/Open$/)).toBeInTheDocument());

    await user.click(
      within(history).getByRole("button", { name: "Delete purchase of Nov 1, 2026" }),
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete this purchase?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Purchase deleted")).toBeInTheDocument();
    expect(await screen.findByText("No purchases recorded yet.")).toBeInTheDocument();
  });

  it("clears a ran-out date while editing and reports errors on the field or in a toast", async () => {
    const talisker = byName("Talisker 10");
    purchases = [purchase(talisker.id, { finished_on: "2026-11-05" })];
    server.use(
      http.patch(`${url}/:id/purchases/:purchaseId`, async ({ request }) => {
        const body = (await request.json()) as Partial<Purchase>;
        if (body.finished_on === null) return failure("INTERNAL", 500, "Boom");
        const message = "A bottle cannot run out before the day it was bought";
        return failure("VALIDATION", 400, message, [{ path: ["finished_on"], message }]);
      }),
      http.post(`${url}/:id/finish`, () => failure("INTERNAL", 500, "Down")),
    );
    const { user } = await openDetail("Talisker 10", "stock");
    const history = await screen.findByRole("list", { name: "Purchases" });
    await user.click(within(history).getByRole("button", { name: "Edit purchase of Nov 1, 2026" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit purchase" });
    await user.clear(within(sheet).getByLabelText("Ran out on"));
    await user.type(within(sheet).getByLabelText("Ran out on"), "2026-10-01");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(
      await within(sheet).findByText("A bottle cannot run out before the day it was bought"),
    ).toBeInTheDocument();
    await user.clear(within(sheet).getByLabelText("Ran out on"));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save the purchase")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(await within(history).findByRole("button", { name: "Reopen" }));
    expect(await screen.findByText("Could not reopen the bottle")).toBeInTheDocument();
  });

  it("sets the status by hand, including no status, and recovers from a failure", async () => {
    const { user } = await openDetail();
    await user.click(statusOf("Talisker 10"));
    expect(screen.getByText(/running out of the last one makes it Finished/)).toBeInTheDocument();
    // Picking the current status changes nothing.
    await user.click(screen.getByRole("button", { name: "Owned" }));
    expect(requests).toEqual([]);
    await openStock(user, "Talisker 10", "Want to try");
    await waitFor(() =>
      expect(requests.at(-1)).toEqual({
        method: "PATCH",
        path: "status",
        body: { status: "want_to_try" },
      }),
    );
    await waitFor(() => expect(statusOf("Talisker 10")).toHaveTextContent("Want to try"));
    await openStock(user, "Talisker 10", "No status");
    await waitFor(() => expect(requests.at(-1)?.body).toEqual({ status: null }));
    await waitFor(() => expect(statusOf("Talisker 10")).toHaveTextContent("No status"));

    server.use(http.patch(`${url}/:id/status`, () => failure("INTERNAL", 500, "Boom")));
    await openStock(user, "Talisker 10", "Owned");
    expect(await screen.findByText("Could not update the bottle")).toBeInTheDocument();
  });

  it("shows the purchases load error with a retry", async () => {
    let fail = true;
    server.use(
      http.get(`${url}/:id/purchases`, () =>
        fail ? failure("INTERNAL", 500, "Down") : HttpResponse.json({ items: [] }),
      ),
    );
    const { user, queryClient } = renderWithProviders(
      `/bottles/${byName("Talisker 10").id}?tab=stock`,
    );
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const history = await screen.findByRole("region", { name: "Stock" });
    expect(await within(history).findByRole("alert")).toHaveTextContent("Down");
    fail = false;
    await user.click(within(history).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No purchases recorded yet.")).toBeInTheDocument();
  });

  it("edits the bottle", async () => {
    store.push(
      product("Glenlivet 12", scotch, { vintage: 2010, country: "GB", region: "Scotland" }),
    );
    const { user } = await openDetail("Glenlivet 12");
    await user.click(screen.getByRole("button", { name: "Edit bottle" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit Glenlivet 12" });
    expect(within(sheet).getByLabelText("Category")).toHaveTextContent("Scotch");
    expect(within(sheet).getByLabelText("Vintage")).toHaveValue(2010);
    await user.clear(within(sheet).getByLabelText("Vintage"));
    expect(within(sheet).getByLabelText("Country")).toHaveTextContent("United Kingdom");
    await choose(user, "Country", "No country");
    await choose(user, "Category", "Whisky");
    expect(within(sheet).getByLabelText("Status")).toHaveTextContent("Tasted");
    await choose(user, "Status", "Want to buy");
    await choose(user, "Status", "No status");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Bottle saved")).toBeInTheDocument();
    expect(requests.at(-1)?.body).toMatchObject({
      category_id: whisky.id,
      vintage: null,
      country: null,
      status: null,
    });
    expect(await screen.findByText("Whisky")).toBeInTheDocument();
  });

  it("matches accents loosely when searching countries", async () => {
    store.push(product("Rhum", gin, { country: "RE" }));
    const { user } = await openDetail("Rhum");
    await user.click(screen.getByRole("button", { name: "Edit bottle" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit Rhum" });
    const picker = within(sheet).getByLabelText("Country");
    expect(picker).toHaveTextContent("Réunion");
    await user.click(picker);
    await user.type(screen.getByLabelText("Search countries"), "reunion");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.click(screen.getByRole("option", { name: "Réunion" }));
    expect(picker).toHaveTextContent("Réunion");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toMatchObject({ country: "RE" });
  });

  it("shows the country name among the facts", async () => {
    store.push(product("Yamazaki 12", whisky, { country: "JP" }));
    await openDetail("Yamazaki 12");
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.queryByText("JP")).not.toBeInTheDocument();
  });

  it("waits for the categories before showing the form", async () => {
    server.use(http.get(`/api/bars/${BAR_ID}/categories/tree`, async () => delay("infinite")));
    const { user } = await openDetail();
    await user.click(screen.getByRole("button", { name: "Edit bottle" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("status")).toHaveTextContent("Loading categories…");
    expect(within(sheet).queryByLabelText("Category")).not.toBeInTheDocument();
  });

  it("deletes the bottle after confirmation and goes back to the list", async () => {
    const { user, router } = await openDetail();
    await user.click(screen.getByRole("button", { name: "Delete bottle" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Talisker 10?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/bottles"));
    expect(await screen.findByText("Deleted Talisker 10")).toBeInTheDocument();
    expect(store.map((p) => p.name)).not.toContain("Talisker 10");
  });

  it("hides edit actions from viewers", async () => {
    asViewer();
    purchases = [purchase(byName("Talisker 10").id)];
    await openDetail("Talisker 10", "stock");
    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Status of/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Purchases" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /purchase of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit bottle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete bottle" })).not.toBeInTheDocument();
  });

  it("shows no badge for a bottle without a status", async () => {
    store.push(product("Campari", gin, { status: null }));
    await openDetail("Campari");
    for (const label of ["Owned", "Finished", "Tasted"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(statusOf("Campari")).toHaveTextContent("No status");
  });

  it("says when the bottle does not exist", async () => {
    renderWithProviders(`/bottles/${id(999)}`);
    expect(await screen.findByText("Bottle not found")).toBeInTheDocument();
  });

  it("shows other load errors with a retry", async () => {
    server.use(http.get(`${url}/:id`, () => failure("INTERNAL", 500, "Down")));
    const { user } = renderWithProviders(`/bottles/${byName("Talisker 10").id}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("Down");
    server.resetHandlers();
    useFakeApi();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Talisker 10" })).toBeInTheDocument();
  });
});
