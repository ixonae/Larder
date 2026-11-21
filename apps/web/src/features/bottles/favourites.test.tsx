import type { Product } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, expect, it } from "vitest";
import { failure, fixtureId, page, timestamps } from "@/test/fixtures.ts";
import { BAR_ID, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

const id = (n: number): string => fixtureId(n, "fa");
const url = `/api/bars/${BAR_ID}/products`;

const bottle = (n: number, name: string, is_favourite = false): Product => ({
  id: id(n),
  name,
  category_id: id(1),
  category_name: "Gin",
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
  is_favourite,
  comment_count: 0,
  ...timestamps,
});

let store: Product[] = [];
let lists: URLSearchParams[] = [];
let changes: string[] = [];

beforeEach(() => {
  store = [bottle(10, "Hendrick's"), bottle(11, "Tanqueray", true)];
  lists = [];
  changes = [];
  server.use(
    http.get(url, ({ request }) => {
      const params = new URL(request.url).searchParams;
      lists.push(params);
      return page(store.filter((p) => params.get("favourite") !== "true" || p.is_favourite));
    }),
    http.get(`${url}/:id`, ({ params }) =>
      HttpResponse.json(store.find((p) => p.id === params.id)),
    ),
    http.get(`${url}/:id/purchases`, () => HttpResponse.json({ items: [] })),
    http.all(`${url}/:id/favourite`, async ({ request, params }) => {
      await delay(20);
      changes.push(`${request.method} ${params.id}`);
      store = store.map((p) =>
        p.id === params.id ? { ...p, is_favourite: request.method === "PUT" } : p,
      );
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const row = async (name: string): Promise<HTMLElement> =>
  (await screen.findByRole("link", { name })).closest("li") as HTMLElement;

it("favourites a bottle from its row at once", async () => {
  const { user } = renderWithProviders("/bottles");
  const hendricks = await row("Hendrick's");
  await user.click(within(hendricks).getByRole("button", { name: "Add to favourites" }));
  expect(within(hendricks).getByRole("button", { name: "Remove from favourites" })).toBeVisible();
  await waitFor(() => expect(changes).toEqual([`PUT ${id(10)}`]));
});

it("rolls the heart back with a toast when the change fails", async () => {
  server.use(http.all(`${url}/:id/favourite`, () => failure("INTERNAL", 500, "Offline")));
  const { user } = renderWithProviders("/bottles");
  const tanqueray = await row("Tanqueray");
  await user.click(within(tanqueray).getByRole("button", { name: "Remove from favourites" }));
  expect(await screen.findByText("Could not update your favourites")).toBeInTheDocument();
  expect(within(tanqueray).getByRole("button", { name: "Remove from favourites" })).toBeVisible();
});

it("keeps a successful favourite change when another bottle's pending change fails", async () => {
  const response = Promise.withResolvers<void>();
  server.use(
    http.put(`${url}/${id(10)}/favourite`, async () => {
      await response.promise;
      return failure("INTERNAL", 500, "Offline");
    }),
  );
  const { user } = renderWithProviders("/bottles");
  const hendricks = within(await row("Hendrick's"));
  const tanqueray = within(await row("Tanqueray"));
  await user.click(hendricks.getByRole("button", { name: "Add to favourites" }));
  const pending = await hendricks.findByRole("button", { name: "Remove from favourites" });
  expect(pending).toBeDisabled();
  await user.click(pending);
  await user.click(tanqueray.getByRole("button", { name: "Remove from favourites" }));
  await waitFor(() =>
    expect(tanqueray.getByRole("button", { name: "Add to favourites" })).toBeEnabled(),
  );
  response.resolve();
  expect(await screen.findByText("Could not update your favourites")).toBeInTheDocument();
  expect(hendricks.getByRole("button", { name: "Add to favourites" })).toBeEnabled();
  expect(tanqueray.getByRole("button", { name: "Add to favourites" })).toBeEnabled();
  expect(changes).toEqual([`DELETE ${id(11)}`]);
});

it("filters the list to favourites and refreshes it after a change", async () => {
  const { user, router } = renderWithProviders("/bottles");
  await row("Hendrick's");
  await user.click(screen.getByRole("checkbox", { name: "Favourites" }));
  await waitFor(() => expect(router.state.location.search).toEqual({ favourite: true }));
  await waitFor(() => expect(lists.at(-1)?.get("favourite")).toBe("true"));
  expect(screen.queryByRole("link", { name: "Hendrick's" })).toBeNull();
  await user.click(
    within(await row("Tanqueray")).getByRole("button", { name: "Remove from favourites" }),
  );
  expect(await screen.findByText("No bottles match")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "Favourites" }));
  await waitFor(() => expect(router.state.location.search).toEqual({}));
});

it("toggles the favourite from the bottle page", async () => {
  const { user } = renderWithProviders(`/bottles/${id(11)}`);
  await user.click(await screen.findByRole("button", { name: "Remove from favourites" }));
  expect(screen.getByRole("button", { name: "Add to favourites" })).toBeVisible();
  await waitFor(() => expect(changes).toEqual([`DELETE ${id(11)}`]));
});
