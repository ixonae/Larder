import { buildTree, type Category, type Product, type Tasting } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { localToday } from "@/lib/dates.ts";
import { failure, fixtureId, page, timestamps } from "@/test/fixtures.ts";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { choose, renderWithProviders } from "@/test/render.tsx";

const id = (n: number) => fixtureId(n, "7a");
const base = `/api/bars/${BAR_ID}`;
const ME = meFixture.user;
const OTHER = { id: id(999), display_name: "Bob" };

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
const categories = [spirit, whisky];

const bottle = (n: number, name: string, extra: Partial<Product> = {}): Product => ({
  id: id(n),
  name,
  category_id: whisky.id,
  category_name: whisky.name,
  producer: null,
  country: null,
  region: null,
  abv: null,
  vintage: null,
  age_years: null,
  description: null,
  image_id: null,
  status: "owned",
  stock: { open_count: 0, total_count: 0, last_bought_on: null, last_finished_on: null },
  tasting_summary: { count: 0, avg_score: null, last_tasted_on: null },
  is_favourite: false,
  comment_count: 0,
  ...timestamps,
  ...extra,
});

let seq = 500;
const tasting = (product: Product, extra: Partial<Tasting> = {}): Tasting => ({
  id: id(++seq),
  product_id: product.id,
  tasted_on: "2026-11-01",
  score: 4,
  notes: null,
  location: null,
  is_private: false,
  author: { id: ME.id, display_name: ME.display_name },
  product: {
    id: product.id,
    name: product.name,
    image_id: null,
    category_id: product.category_id,
    category_name: product.category_name,
    status: product.status,
  },
  can_delete: true,
  ...timestamps,
  ...extra,
});

let products: Product[] = [];
let tastings: Tasting[] = [];
let requests: { method: string; url: URL; body?: unknown }[] = [];

const record = async (request: Request) => {
  const body =
    request.method === "GET" || request.method === "DELETE"
      ? undefined
      : await request.clone().json();
  requests.push({ method: request.method, url: new URL(request.url), body });
};
const sent = (method: string, path: string) =>
  requests.filter((r) => r.method === method && r.url.pathname === `${base}${path}`);

beforeEach(() => {
  seq = 500;
  products = [bottle(10, "Talisker"), bottle(11, "Yoichi", { status: "want_to_try" })];
  tastings = [];
  requests = [];
  server.use(
    http.get(`${base}/categories/tree`, () => HttpResponse.json({ items: buildTree(categories) })),
    http.get(`${base}/products`, async ({ request }) => {
      await record(request);
      const q = new URL(request.url).searchParams.get("q")?.toLowerCase();
      return page(products.filter((p) => !q || p.name.toLowerCase().includes(q)));
    }),
    http.get(`${base}/products/:id`, ({ params }) => {
      const found = products.find((p) => p.id === params.id);
      return found ? HttpResponse.json(found) : failure("NOT_FOUND", 404);
    }),
    http.post(`${base}/products`, async ({ request }) => {
      await record(request);
      const body = (await request.json()) as Partial<Product>;
      const created = bottle(20, body.name as string, body);
      products.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${base}/products/:id/status`, async ({ request, params }) => {
      await record(request);
      const body = (await request.json()) as Pick<Product, "status">;
      products = products.map((p) => (p.id === params.id ? { ...p, ...body } : p));
      return HttpResponse.json(products.find((p) => p.id === params.id));
    }),
    http.get(`${base}/tastings`, async ({ request }) => {
      await record(request);
      const query = new URL(request.url).searchParams;
      const productId = query.get("product_id");
      const visibility = query.get("visibility");
      return page(
        tastings.filter(
          (t) =>
            (!productId || t.product_id === productId) &&
            (!t.is_private || t.author.id === ME.id) &&
            (!visibility || t.is_private === (visibility === "private")),
        ),
      );
    }),
    http.get(`${base}/products/:id/tastings`, async ({ request, params }) => {
      await record(request);
      const limit = Number(new URL(request.url).searchParams.get("limit"));
      return page(tastings.filter((t) => t.product_id === params.id).slice(0, limit));
    }),
    http.post(`${base}/products/:id/tastings`, async ({ request, params }) => {
      await record(request);
      const product = products.find((p) => p.id === params.id) as Product;
      const created = tasting(product, (await request.json()) as Partial<Tasting>);
      tastings = [created, ...tastings];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${base}/tastings/:id`, async ({ request, params }) => {
      await record(request);
      const body = (await request.json()) as Partial<Tasting>;
      tastings = tastings.map((t) => (t.id === params.id ? { ...t, ...body } : t));
      return HttpResponse.json(tastings.find((t) => t.id === params.id));
    }),
    http.delete(`${base}/tastings/:id`, async ({ request, params }) => {
      await record(request);
      tastings = tastings.filter((t) => t.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const asViewer = () =>
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        ...meFixture,
        bars: [{ ...meFixture.bars[0], role: "viewer" }],
      }),
    ),
  );

describe("Tastings page", () => {
  it("shows the journal by month, newest first, with only my entries editable", async () => {
    const [talisker, yoichi] = products as [Product, Product];
    tastings = [
      tasting(talisker, {
        tasted_on: "2026-11-12",
        score: 5,
        location: "Home",
        notes: "Smoke and salt",
      }),
      tasting(talisker, { tasted_on: "2026-11-10" }),
      tasting(yoichi, { tasted_on: "2026-10-03", score: null, author: OTHER, can_delete: false }),
    ];
    renderWithProviders("/tastings");
    const november = await screen.findByRole("region", { name: "November 2026" });
    const october = screen.getByRole("region", { name: "October 2026" });
    expect(
      november.compareDocumentPosition(october) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(november).getAllByRole("listitem")).toHaveLength(2);
    const mine = within(november).getByRole("listitem", { name: "Talisker, Nov 12, 2026" });
    expect(within(mine).getByRole("link", { name: "Talisker" })).toBeInTheDocument();
    expect(within(mine).getByRole("img", { name: "5 out of 5" })).toBeInTheDocument();
    expect(mine).toHaveTextContent(`${ME.display_name} · Nov 12, 2026`);
    expect(mine).toHaveTextContent("Home");
    expect(mine).toHaveTextContent("Smoke and salt");
    expect(within(mine).getByRole("button", { name: "Edit tasting" })).toBeInTheDocument();
    const theirs = within(october).getByRole("listitem");
    expect(theirs).toHaveTextContent("No score");
    expect(theirs).toHaveTextContent("Bob · Oct 3, 2026");
    expect(within(theirs).queryByRole("button", { name: "Edit tasting" })).toBeNull();
  });

  it("filters by category, minimum score, author and visibility from the filter sheet", async () => {
    const { user } = renderWithProviders("/tastings");
    expect(await screen.findByText("No tastings yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = await screen.findByRole("dialog", { name: "Filter tastings" });
    await choose(user, "Category", "Whisky");
    await user.click(within(sheet).getByRole("radio", { name: "3 stars" }));
    await user.click(within(sheet).getByRole("checkbox", { name: "Only mine" }));
    await user.click(within(sheet).getByRole("radio", { name: "Private" }));
    await waitFor(() => {
      const last = sent("GET", "/tastings").at(-1)?.url.searchParams;
      expect(Object.fromEntries(last ?? [])).toEqual({
        category_id: whisky.id,
        score_min: "3",
        mine: "true",
        visibility: "private",
      });
    });
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "Filters (4)" })).toBeInTheDocument();
    expect(screen.getByText("No tastings match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters (4)" }));
    const reopened = await screen.findByRole("dialog", { name: "Filter tastings" });
    // Each filter can be undone on its own, or all at once.
    await user.click(within(reopened).getByRole("radio", { name: "3 stars" }));
    await user.click(within(reopened).getByRole("checkbox", { name: "Only mine" }));
    await choose(user, "Category", "All categories");
    expect(within(reopened).getByRole("radio", { name: "Private" })).toBeChecked();
    await user.click(within(reopened).getByRole("radio", { name: "All" }));
    await waitFor(() =>
      expect([...(sent("GET", "/tastings").at(-1)?.url.searchParams ?? [])]).toEqual([]),
    );
    await user.click(within(reopened).getByRole("checkbox", { name: "Only mine" }));
    await user.click(within(reopened).getByRole("radio", { name: "Public" }));
    await user.click(within(reopened).getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect([...(sent("GET", "/tastings").at(-1)?.url.searchParams ?? [])]).toEqual([]),
    );
  });

  it("searches and pages through bottles in the filter sheet and clears the selection", async () => {
    const [talisker, yoichi] = products as [Product, Product];
    tastings = [tasting(talisker), tasting(yoichi)];
    server.use(
      http.get(`${base}/products`, ({ request }) => {
        const { searchParams } = new URL(request.url);
        if (searchParams.get("q") !== "Yoichi") return page([talisker]);
        return searchParams.has("cursor") ? page([yoichi]) : page([], "next");
      }),
    );
    const { user, router } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Filters" }));
    const sheet = await screen.findByRole("dialog", { name: "Filter tastings" });
    await user.click(within(sheet).getByRole("combobox", { name: "Bottle" }));
    await user.type(screen.getByLabelText("Search bottles"), "Yoichi");
    await user.click(await screen.findByRole("button", { name: "Load more bottles" }));
    await user.click(await screen.findByRole("option", { name: "Yoichi · Whisky" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.search).toEqual({ product: yoichi.id }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Talisker" })).toBeNull());
    expect(screen.getByRole("link", { name: "Yoichi" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Filters (1)" }));
    expect(screen.getByRole("combobox", { name: "Bottle" })).toHaveTextContent("Yoichi");
    await choose(user, "Bottle", "All bottles");
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("adds a tasting of an existing bottle from the floating button", async () => {
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Add tasting" });
    expect(within(sheet).getByLabelText("Date")).toHaveValue(localToday());
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await within(sheet).findByText("Choose a bottle")).toBeInTheDocument();
    await choose(user, "Bottle", "Talisker · Whisky");
    await user.click(within(sheet).getByRole("radio", { name: "4 stars" }));
    await user.type(within(sheet).getByLabelText("Notes"), "Peaty");
    await user.type(within(sheet).getByLabelText("Location"), "Home");
    expect(within(sheet).getByRole("radio", { name: "Public" })).toBeChecked();
    await user.click(within(sheet).getByRole("radio", { name: "Only me" }));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Tasting saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as tasted" })).toBeNull();
    expect(sent("POST", `/products/${id(10)}/tastings`)[0]?.body).toEqual({
      tasted_on: localToday(),
      score: 4,
      notes: "Peaty",
      location: "Home",
      is_private: true,
    });
    expect(await screen.findByRole("link", { name: "Talisker" })).toBeInTheDocument();
    expect(await screen.findByText("Only you")).toBeInTheDocument();
  });

  it("distinguishes vintages with the same bottle name when adding a tasting", async () => {
    products = [
      bottle(10, "Talisker", { vintage: 2015 }),
      bottle(11, "Talisker", { vintage: 2016 }),
    ];
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    await user.click(screen.getByRole("combobox", { name: "Bottle" }));
    expect(await screen.findByRole("option", { name: "Talisker (2015) · Whisky" })).toBeVisible();
    await user.click(screen.getByRole("option", { name: "Talisker (2016) · Whisky" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Tasting saved")).toBeInTheDocument();
    expect(sent("POST", `/products/${id(11)}/tastings`)).toHaveLength(1);
  });

  it("offers to add a bottle only when the typed name is not already listed", async () => {
    products = [bottle(10, "Talisker"), bottle(11, "Yoichi", { vintage: 2015 })];
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    await user.click(screen.getByRole("combobox", { name: "Bottle" }));
    const search = screen.getByLabelText("Search bottles");
    await user.type(search, "talisker");
    expect(await screen.findByRole("option", { name: "Talisker · Whisky" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Add “talisker”" })).toBeNull();
    await user.clear(search);
    // Only a vintage is listed, so a bottle without one can still be added.
    await user.type(search, "Yoichi");
    expect(await screen.findByRole("option", { name: "Yoichi (2015) · Whisky" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Add “Yoichi”" })).toBeVisible();
  });

  it("creates a missing bottle on the fly as tasted, then records the tasting", async () => {
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Add tasting" });
    await user.click(within(sheet).getByRole("combobox", { name: "Bottle" }));
    await user.type(screen.getByLabelText("Search bottles"), "Hibiki");
    await user.click(await screen.findByRole("option", { name: "Add “Hibiki”" }));
    const form = await within(sheet).findByRole("form", { name: "New bottle" });
    expect(within(form).getByLabelText("Name")).toHaveValue("Hibiki");
    await user.click(within(form).getByRole("button", { name: "Add bottle" }));
    expect(await within(form).findByText("Choose a category")).toBeInTheDocument();
    await choose(user, "Category", "Whisky");
    await choose(user, "Country", "Japan");
    await user.click(within(form).getByRole("button", { name: "Add bottle" }));
    expect(await screen.findByText("Added Hibiki")).toBeInTheDocument();
    expect(sent("POST", "/products")[0]?.body).toEqual({
      name: "Hibiki",
      category_id: whisky.id,
      country: "JP",
      status: "tasted",
    });
    expect(within(sheet).queryByRole("form", { name: "New bottle" })).toBeNull();
    expect(within(sheet).getByRole("combobox", { name: "Bottle" })).toHaveTextContent("Hibiki");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Tasting saved")).toBeInTheDocument();
    expect(sent("POST", `/products/${id(20)}/tastings`)).toHaveLength(1);
  });

  it("goes back from the new bottle form without creating anything", async () => {
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Add tasting" });
    await user.click(within(sheet).getByRole("combobox", { name: "Bottle" }));
    await user.type(screen.getByLabelText("Search bottles"), "Nikka");
    await user.click(await screen.findByRole("option", { name: "Add “Nikka”" }));
    await user.click(await within(sheet).findByRole("button", { name: "Back" }));
    expect(within(sheet).getByRole("combobox", { name: "Bottle" })).toHaveTextContent(
      "Choose a bottle…",
    );
    expect(sent("POST", "/products")).toEqual([]);
  });

  it("keeps everything entered when a save fails, and saves on retry", async () => {
    server.use(
      http.post(
        `${base}/products/:id/tastings`,
        () => failure("INTERNAL", 500, "Database is locked"),
        { once: true },
      ),
    );
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Add tasting" });
    await choose(user, "Bottle", "Talisker · Whisky");
    await user.type(within(sheet).getByLabelText("Notes"), "Briny");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save the tasting")).toBeInTheDocument();
    expect(screen.getByText("Database is locked")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Notes")).toHaveValue("Briny");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Tasting saved")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Add tasting" })).toBeNull();
    expect(tastings).toMatchObject([{ product_id: id(10), notes: "Briny" }]);
  });

  it("shows field errors from the server on the form", async () => {
    server.use(
      http.post(
        `${base}/products/:id/tastings`,
        () => failure("VALIDATION", 400, "Invalid", [{ path: ["location"], message: "Too long" }]),
        { once: true },
      ),
      http.post(
        `${base}/products`,
        () => failure("CONFLICT", 409, "Duplicate", [{ path: ["name"], message: "Taken" }]),
        { once: true },
      ),
    );
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Add tasting" });
    await user.click(within(sheet).getByRole("combobox", { name: "Bottle" }));
    // Not listed here (say, a bottle the search missed), so only the server spots the duplicate.
    await user.type(screen.getByLabelText("Search bottles"), "Lagavulin");
    await user.click(await screen.findByRole("option", { name: "Add “Lagavulin”" }));
    await choose(user, "Category", "Whisky");
    await choose(user, "Country", "Japan");
    await choose(user, "Country", "No country");
    await user.click(within(sheet).getByRole("button", { name: "Add bottle" }));
    expect(await within(sheet).findByText("Taken")).toBeInTheDocument();
    expect(
      requests.find((r) => r.url.pathname === `${base}/products` && r.method === "POST"),
    ).toBeUndefined();
    server.use(
      http.post(`${base}/products`, () => failure("INTERNAL", 500, "Disk full"), { once: true }),
    );
    await user.click(within(sheet).getByRole("button", { name: "Add bottle" }));
    expect(await screen.findByText("Could not add the bottle")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Back" }));
    await user.click(within(sheet).getByRole("combobox", { name: "Bottle" }));
    await user.clear(screen.getByLabelText("Search bottles"));
    await user.click(await screen.findByRole("option", { name: "Talisker · Whisky" }));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await within(sheet).findByText("Too long")).toBeInTheDocument();
  });

  it("offers to mark a wanted bottle as tasted after saving", async () => {
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    await choose(user, "Bottle", "Yoichi · Whisky");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Mark Yoichi as tasted?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark as tasted" }));
    expect(await screen.findByText("Yoichi marked as tasted")).toBeInTheDocument();
    expect(sent("PATCH", `/products/${id(11)}/status`)[0]?.body).toEqual({ status: "tasted" });
  });

  it("reports a failed status change from the toast", async () => {
    server.use(
      http.patch(`${base}/products/:id/status`, () => failure("INTERNAL", 500, "Offline")),
    );
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Add tasting" }));
    await choose(user, "Bottle", "Yoichi · Whisky");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Mark as tasted" }));
    expect(await screen.findByText("Could not change the status")).toBeInTheDocument();
  });

  it("edits and deletes my own tasting", async () => {
    tastings = [tasting(products[0] as Product, { score: 3, notes: "Fine", is_private: true })];
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Edit tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit tasting" });
    expect(within(sheet).queryByRole("combobox", { name: "Bottle" })).toBeNull();
    expect(within(sheet).getByLabelText("Notes")).toHaveValue("Fine");
    expect(within(sheet).getByRole("radio", { name: "Only me" })).toBeChecked();
    await user.click(within(sheet).getByRole("radio", { name: "Public" }));
    await user.click(within(sheet).getByRole("radio", { name: "3 stars" }));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Tasting saved")).toBeInTheDocument();
    expect(sent("PATCH", `/tastings/${tastings[0]?.id}`)[0]?.body).toMatchObject({
      score: null,
      notes: "Fine",
      is_private: false,
    });
    expect(await screen.findByText("No score")).toBeInTheDocument();
    expect(screen.queryByText("Only you")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Delete tasting" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete this tasting?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Tasting deleted")).toBeInTheDocument();
    expect(await screen.findByText("No tastings yet")).toBeInTheDocument();
  });

  it("shows a retry when the journal cannot load, and loads more pages", async () => {
    server.use(
      http.get(`${base}/tastings`, () => failure("INTERNAL", 500, "Offline"), { once: true }),
      http.get(`${base}/tastings`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        const talisker = products[0] as Product;
        return cursor
          ? page([tasting(talisker, { tasted_on: "2026-01-01" })])
          : page([tasting(talisker, { tasted_on: "2026-02-01" })], "next");
      }),
    );
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await user.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("region", { name: "January 2026" })).toBeInTheDocument();
  });

  it("keeps the loaded entries when loading more fails, and loads them on retry", async () => {
    let failNext = true;
    server.use(
      http.get(`${base}/tastings`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        const talisker = products[0] as Product;
        if (!cursor) return page([tasting(talisker, { tasted_on: "2026-02-01" })], "next");
        if (failNext) {
          failNext = false;
          return failure("INTERNAL", 500, "Offline");
        }
        return page([tasting(talisker, { tasted_on: "2026-01-01" })]);
      }),
    );
    const { user } = renderWithProviders("/tastings");
    await user.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load more tastings");
    expect(screen.getByRole("region", { name: "February 2026" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("region", { name: "January 2026" })).toBeInTheDocument();
    expect(screen.queryByText(/Could not load more tastings/)).toBeNull();
  });

  it("lets viewers read the journal without adding or editing", async () => {
    asViewer();
    tastings = [tasting(products[0] as Product, { can_delete: false })];
    renderWithProviders("/tastings");
    expect(await screen.findByRole("link", { name: "Talisker" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add tasting" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit tasting" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete tasting" })).toBeNull();
  });

  it("lets the owner delete, but not edit, a tasting by someone who no longer writes", async () => {
    const theirs = tasting(products[0] as Product, { author: OTHER, can_delete: true });
    tastings = [theirs];
    const { user } = renderWithProviders("/tastings");
    const entry = await screen.findByRole("listitem");
    expect(within(entry).queryByRole("button", { name: "Edit tasting" })).toBeNull();
    await user.click(within(entry).getByRole("button", { name: "Delete tasting" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Tasting deleted")).toBeInTheDocument();
    expect(sent("DELETE", `/tastings/${theirs.id}`)).toHaveLength(1);
  });
});

describe("Bottle detail tastings", () => {
  it("shows the average, the last day and the latest entries, and links to all of them", async () => {
    const talisker = bottle(10, "Talisker", {
      tasting_summary: { count: 4, avg_score: 4.5, last_tasted_on: "2026-11-12" },
    });
    products = [talisker];
    tastings = [
      tasting(talisker, { tasted_on: "2026-11-12", score: 5, notes: "Great" }),
      tasting(talisker, { tasted_on: "2026-10-01", score: 4, author: OTHER, can_delete: false }),
    ];
    const { user, router } = renderWithProviders(`/bottles/${talisker.id}?tab=tastings`);
    const section = await screen.findByRole("tabpanel", { name: /^Tastings/ });
    expect(within(section).getByRole("img", { name: "4.5 average out of 5" })).toBeInTheDocument();
    expect(section).toHaveTextContent("4 tastingslast Nov 12, 2026");
    const latest = await within(section).findByRole("list", { name: "Latest tastings" });
    expect(sent("GET", `/products/${talisker.id}/tastings`)[0]?.url.searchParams.get("limit")).toBe(
      "3",
    );
    expect(within(latest).getAllByRole("listitem")).toHaveLength(2);
    expect(within(latest).queryByRole("link", { name: "Talisker" })).toBeNull();
    expect(within(latest).getAllByRole("button", { name: "Edit tasting" })).toHaveLength(1);

    await user.click(within(section).getByRole("link", { name: "See all 4 tastings" }));
    expect(await screen.findByRole("heading", { name: "Tastings" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ product: talisker.id });
    await waitFor(() =>
      expect(sent("GET", "/tastings").at(-1)?.url.searchParams.get("product_id")).toBe(talisker.id),
    );
    expect(await screen.findByText("Talisker", { selector: "span" })).toBeInTheDocument();
    // Adding from the filtered journal is about that bottle.
    await user.click(screen.getByRole("button", { name: "Add tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Add tasting" });
    expect(within(sheet).queryByRole("combobox", { name: "Bottle" })).toBeNull();
    expect(within(sheet).getByText("Talisker")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Show every bottle" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("adds a tasting of this bottle and says when it has none or no score", async () => {
    const talisker = products[0] as Product;
    const { user } = renderWithProviders(`/bottles/${talisker.id}?tab=tastings`);
    const section = await screen.findByRole("tabpanel", { name: /^Tastings/ });
    expect(section).toHaveTextContent("Not tasted yet.");
    expect(within(section).queryByRole("link", { name: /See all/ })).toBeNull();
    await user.click(within(section).getByRole("button", { name: "Add tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Add tasting" });
    expect(within(sheet).queryByRole("combobox", { name: "Bottle" })).toBeNull();
    products = [
      { ...talisker, tasting_summary: { count: 1, avg_score: null, last_tasted_on: null } },
    ];
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Tasting saved")).toBeInTheDocument();
    expect(await within(section).findByText("No score yet")).toBeInTheDocument();
    expect(section).toHaveTextContent("1 tasting");
  });

  it("edits my tasting from the bottle page", async () => {
    const talisker = products[0] as Product;
    tastings = [tasting(talisker, { notes: "Smoky" })];
    const { user } = renderWithProviders(`/bottles/${talisker.id}?tab=tastings`);
    const section = await screen.findByRole("tabpanel", { name: /^Tastings/ });
    await user.click(await within(section).findByRole("button", { name: "Edit tasting" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit tasting" });
    expect(within(sheet).getByLabelText("Notes")).toHaveValue("Smoky");
  });

  it("names an unknown bottle in the journal filter generically", async () => {
    renderWithProviders(`/tastings?product=${id(404)}`);
    expect(await screen.findByText("One bottle")).toBeInTheDocument();
  });

  it("offers a retry when the latest tastings cannot load", async () => {
    server.use(
      http.get(`${base}/products/:id/tastings`, () => failure("INTERNAL", 500, "Offline"), {
        once: true,
      }),
    );
    const { user } = renderWithProviders(`/bottles/${id(10)}?tab=tastings`);
    const section = await screen.findByRole("tabpanel", { name: /^Tastings/ });
    await user.click(await within(section).findByRole("button", { name: "Try again" }));
    expect(await within(section).findByText("Not tasted yet.")).toBeInTheDocument();
  });

  it("shows the average score on bottle rows", async () => {
    products = [
      bottle(10, "Talisker", {
        tasting_summary: { count: 1, avg_score: 4, last_tasted_on: "2026-11-01" },
      }),
    ];
    renderWithProviders("/bottles");
    expect(await screen.findByRole("img", { name: "4 out of 5" })).toBeInTheDocument();
  });
});
