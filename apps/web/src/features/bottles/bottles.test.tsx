import { buildTree, type Category, type Product, subtreeIds } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

const url = `/api/bars/${BAR_ID}/products`;
const id = (n: number) => `01a1f326-d941-7d74-8a40-${String(n).padStart(12, "0")}`;
const stamp = "2026-01-01T00:00:00.000Z";

const category = (n: number, name: string, parent: Category | null = null): Category => ({
  id: id(n),
  name,
  parent_id: parent?.id ?? null,
  kind: "spirit",
  default_abv: 40,
  description: null,
  image_id: null,
  created_at: stamp,
  updated_at: stamp,
});
const spirit = category(1, "Spirit");
const whisky = category(2, "Whisky", spirit);
const scotch = category(3, "Scotch", whisky);
const gin = category(4, "Gin", spirit);
const categories = [spirit, whisky, scotch, gin];

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
  in_bar: false,
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});

let store: Product[] = [];
let requests: { method: string; path: string; body?: unknown }[] = [];
const PAGE = 2;

const conflict = (message: string) =>
  HttpResponse.json(
    { error: { code: "CONFLICT", message, details: [{ path: ["name"], message }] } },
    { status: 409 },
  );

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
      const inBar = params.get("in_bar");
      const ids = cat ? subtreeIds(categories, cat) : null;
      const matches = [...store]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((p) => !q || p.name.toLowerCase().includes(q))
        .filter((p) => !ids || ids.has(p.category_id))
        .filter((p) => inBar === null || String(p.in_bar) === inBar);
      const start = Number(params.get("cursor") ?? 0);
      const next = start + PAGE < matches.length ? String(start + PAGE) : null;
      return HttpResponse.json({ items: matches.slice(start, start + PAGE), next_cursor: next });
    }),
    http.get(`${url}/:id`, ({ params }) => {
      const found = store.find((p) => p.id === params.id);
      if (found) return HttpResponse.json(found);
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Product not found" } },
        { status: 404 },
      );
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
    http.patch(`${url}/:id/in-bar`, async ({ request, params }) => {
      const body = (await request.json()) as { in_bar: boolean };
      requests.push({ method: "PATCH", path: "in-bar", body });
      store = store.map((p) => (p.id === params.id ? { ...p, in_bar: body.in_bar } : p));
      return HttpResponse.json(store.find((p) => p.id === params.id));
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
    product("Talisker 10", scotch, { producer: "Diageo", in_bar: true, abv: 45.8, age_years: 10 }),
    product("Blended whisky", whisky),
    product("Hendrick's", gin, { in_bar: true }),
  ];
  requests = [];
  useFakeApi();
});

const list = () => screen.getByRole("list", { name: "Bottles" });
const names = () =>
  within(list())
    .getAllByRole("link")
    .map((a) => a.textContent);
const byName = (name: string) => store.find((p) => p.name === name) as Product;

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

  it("filters by search, category including children, and in-bar, kept in the URL", async () => {
    const { user, router } = await openList();
    await user.selectOptions(screen.getByRole("combobox", { name: "Category" }), whisky.id);
    await waitFor(() => expect(names()).toEqual(["Blended whisky", "Talisker 10"]));
    await user.selectOptions(screen.getByRole("combobox", { name: "In the bar" }), "In the bar");
    await waitFor(() => expect(names()).toEqual(["Talisker 10"]));
    expect(router.state.location.search).toEqual({ category: whisky.id, in_bar: true });

    await user.selectOptions(screen.getByRole("combobox", { name: "Category" }), "");
    await user.type(screen.getByRole("searchbox", { name: "Search bottles" }), "hend");
    await waitFor(() => expect(names()).toEqual(["Hendrick's"]));
    await user.clear(screen.getByRole("searchbox", { name: "Search bottles" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "In the bar" }),
      "Not in the bar",
    );
    await waitFor(() => expect(names()).toEqual(["Blended whisky"]));
    await user.selectOptions(screen.getByRole("combobox", { name: "In the bar" }), "");
    await waitFor(() => expect(names()).toHaveLength(2));
    expect(router.state.location.search).toEqual({});
  });

  it("reads filters from the URL and ignores bad ones", async () => {
    await openList(`/bottles?in_bar=maybe&category=${gin.id}`);
    await waitFor(() => expect(names()).toEqual(["Hendrick's"]));
    expect(screen.getByRole("combobox", { name: "In the bar" })).toHaveValue("");
  });

  it("drops a malformed category from the URL instead of failing", async () => {
    await openList("/bottles?category=abc");
    expect(names()).toEqual(["Blended whisky", "Hendrick's"]);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("");
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

  it("toggles a bottle in and out of the bar in one tap", async () => {
    const { user } = await openList();
    const toggle = screen.getByRole("button", { name: "Blended whisky in the bar" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
    expect(requests).toEqual([{ method: "PATCH", path: "in-bar", body: { in_bar: true } }]);
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
    const toggle = screen.getByRole("button", { name: "Blended whisky in the bar" });
    await user.click(toggle);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(byName("Blended whisky").in_bar).toBe(true);
  });

  it("shows a toast when the toggle fails", async () => {
    server.use(
      http.patch(`${url}/:id/in-bar`, () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "Boom" } }, { status: 500 }),
      ),
    );
    const { user } = await openList();
    await user.click(screen.getByRole("button", { name: "Hendrick's in the bar" }));
    expect(await screen.findByText("Could not update the bottle")).toBeInTheDocument();
  });

  it("shows viewers the in-bar state without edit actions", async () => {
    asViewer();
    await openList();
    expect(screen.queryByRole("button", { name: "Add bottle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /in the bar$/ })).not.toBeInTheDocument();
    expect(within(list()).getAllByText("In the bar")).toHaveLength(1);
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
    server.use(
      http.get(url, () =>
        fail
          ? HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 })
          : HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );
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
    await user.type(within(sheet).getByLabelText("Name"), "Ardbeg 10");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await within(sheet).findByText("Choose a category")).toBeInTheDocument();
    expect(requests).toEqual([]);

    await user.selectOptions(within(sheet).getByLabelText("Category"), scotch.id);
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
      in_bar: true,
    });
    expect(await screen.findByText("Bottle added")).toBeInTheDocument();
  });

  it("shows a duplicate name on the field and other errors in a toast", async () => {
    const { user } = await openList();
    await user.click(screen.getByRole("button", { name: "Add bottle" }));
    const sheet = await screen.findByRole("dialog", { name: "New bottle" });
    await user.type(within(sheet).getByLabelText("Name"), "Hendrick's");
    await user.selectOptions(within(sheet).getByLabelText("Category"), gin.id);
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(
      await within(sheet).findByText(`A bottle named "Hendrick's" already exists`),
    ).toBeInTheDocument();

    server.use(
      http.post(url, () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "Disk full" } }, { status: 500 }),
      ),
    );
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
          ? HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 })
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
  async function openDetail(name = "Talisker 10") {
    const view = renderWithProviders(`/bottles/${byName(name).id}`);
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

  it("toggles in-bar from the detail page", async () => {
    const { user } = await openDetail();
    const toggle = screen.getByRole("button", { name: "Talisker 10 in the bar" });
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
  });

  it("edits the bottle", async () => {
    store.push(product("Glenlivet 12", scotch, { vintage: 2010, country: "Scotland" }));
    const { user } = await openDetail("Glenlivet 12");
    await user.click(screen.getByRole("button", { name: "Edit bottle" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit Glenlivet 12" });
    expect(within(sheet).getByLabelText("Category")).toHaveValue(scotch.id);
    expect(within(sheet).getByLabelText("Vintage")).toHaveValue(2010);
    await user.clear(within(sheet).getByLabelText("Vintage"));
    await user.clear(within(sheet).getByLabelText("Country"));
    await user.selectOptions(within(sheet).getByLabelText("Category"), whisky.id);
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Bottle saved")).toBeInTheDocument();
    expect(requests.at(-1)?.body).toMatchObject({
      category_id: whisky.id,
      vintage: null,
      country: null,
    });
    expect(await screen.findByText("Whisky")).toBeInTheDocument();
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
    await openDetail();
    expect(screen.getByText("In the bar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit bottle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete bottle" })).not.toBeInTheDocument();
  });

  it("shows nothing for a viewer when the bottle is not in the bar", async () => {
    asViewer();
    await openDetail("Blended whisky");
    expect(screen.queryByText("In the bar")).not.toBeInTheDocument();
  });

  it("says when the bottle does not exist", async () => {
    renderWithProviders(`/bottles/${id(999)}`);
    expect(await screen.findByText("Bottle not found")).toBeInTheDocument();
  });

  it("shows other load errors with a retry", async () => {
    server.use(
      http.get(`${url}/:id`, () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 }),
      ),
    );
    const { user } = renderWithProviders(`/bottles/${byName("Talisker 10").id}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("Down");
    server.resetHandlers();
    useFakeApi();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Talisker 10" })).toBeInTheDocument();
  });
});
