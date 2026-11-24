import type { Cocktail, CocktailDetail, Comment, RatingInput, User } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { failure, fixtureId, page, timestamps, unrated } from "@/test/fixtures.ts";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

const base: string = `/api/bars/${BAR_ID}`;
const id = (n: number): string => fixtureId(n, "504a488cf");
const cocktailId: string = id(1);
const detailUrl: string = `${base}/cocktails/${cocktailId}`;
const ann = { id: id(20), display_name: "Ann" };
const owner: Pick<User, "id" | "display_name"> = {
  id: meFixture.user.id,
  display_name: meFixture.user.display_name,
};

const detail = (extra: Partial<CocktailDetail> = {}): CocktailDetail => ({
  ...timestamps,
  ...unrated,
  id: cocktailId,
  name: "Gimlet",
  method: "shaken",
  ice: "none",
  glass_id: null,
  servings: 1,
  variant_of_id: null,
  variant_of: null,
  variants: [],
  description: null,
  garnish: null,
  serving_notes: null,
  source: null,
  notes: null,
  variant_note: null,
  image_id: null,
  computed: { abv: 18, volume_ml: 30, spirits: [], ingredients: ["Gin"] },
  missing: [],
  ingredients: [],
  steps: [],
  tools: [],
  tags: [],
  ...extra,
});

/** A server holding one cocktail whose rating and favourite the handlers keep up to date. */
function serveDetail(start: Partial<CocktailDetail>): {
  puts: RatingInput[];
  deletes: number;
  favourites: string[];
} {
  let current: CocktailDetail = detail(start);
  const seen = { puts: [] as RatingInput[], deletes: 0, favourites: [] as string[] };
  server.use(
    http.get(detailUrl, () => HttpResponse.json(current)),
    http.put(`${detailUrl}/rating`, async ({ request }) => {
      const json = (await request.json()) as RatingInput;
      seen.puts.push(json);
      const count: number = current.rating_count + (current.my_rating ? 0 : 1);
      current = {
        ...current,
        my_rating: {
          ...json,
          updated_at: timestamps.updated_at,
        },
        rating_count: count,
      };
      return HttpResponse.json(current.my_rating);
    }),
    http.delete(`${detailUrl}/rating`, () => {
      seen.deletes += 1;
      current = { ...current, my_rating: null, rating_count: current.rating_count - 1 };
      return new HttpResponse(null, { status: 204 });
    }),
    http.put(`${detailUrl}/favourite`, () => {
      seen.favourites.push("put");
      current = { ...current, is_favourite: true };
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${detailUrl}/favourite`, () => {
      seen.favourites.push("delete");
      current = { ...current, is_favourite: false };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return {
    puts: seen.puts,
    get deletes(): number {
      return seen.deletes;
    },
    favourites: seen.favourites,
  };
}

it("rates, changes the score and clears the rating", async () => {
  const seen = serveDetail({ avg_rating: 4.2, rating_count: 7, other_ratings: [] });
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  expect(await screen.findByText("4.2 (7)")).toBeInTheDocument();

  await user.click(screen.getByRole("radio", { name: "4 stars" }));
  await waitFor(() => expect(screen.getByRole("radio", { name: "4 stars" })).toBeChecked());
  expect(seen.puts).toEqual([{ score: 4 }]);

  await user.click(screen.getByRole("radio", { name: "5 stars" }));
  await waitFor(() => expect(seen.puts.at(-1)).toEqual({ score: 5 }));

  await user.click(screen.getByRole("radio", { name: "5 stars" }));
  await waitFor(() => expect(screen.getByRole("radio", { name: "5 stars" })).not.toBeChecked());
  expect(seen.deletes).toBe(1);
});

it("keeps a newer score showing while an older save settles", async () => {
  serveDetail({});
  const gets: string[] = [];
  const release: Record<number, () => void> = {};
  server.use(
    http.get(detailUrl, () => {
      gets.push("get");
      return HttpResponse.json(detail());
    }),
    http.put(`${detailUrl}/rating`, async ({ request }) => {
      const { score } = (await request.json()) as RatingInput;
      await new Promise<void>((resolve) => {
        release[score] = resolve;
      });
      return HttpResponse.json({ score, updated_at: timestamps.updated_at });
    }),
  );
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  await user.click(await screen.findByRole("radio", { name: "3 stars" }));
  await user.click(screen.getByRole("radio", { name: "5 stars" }));
  await waitFor(() => expect(Object.keys(release)).toEqual(["3", "5"]));
  const loads: number = gets.length;
  release[3]?.();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(gets).toHaveLength(loads);
  expect(screen.getByRole("radio", { name: "5 stars" })).toBeChecked();
  release[5]?.();
  await waitFor(() => expect(gets.length).toBeGreaterThan(loads));
});

it("shows the community rating and who else rated", async () => {
  serveDetail({
    avg_rating: 3.5,
    rating_count: 3,
    other_ratings: [{ user: ann, score: 5, updated_at: timestamps.updated_at }],
    my_rating: { score: 2, updated_at: timestamps.updated_at },
  });
  renderWithProviders(`/cocktails/${cocktailId}`);
  const raters: HTMLElement = await screen.findByRole("list", { name: "Raters" });
  expect(within(raters).getByText("Ann")).toBeInTheDocument();
  expect(within(raters).getByRole("img", { name: "5 out of 5 stars" })).toBeInTheDocument();
  expect(screen.getByText("3.5 (3)")).toBeInTheDocument();
});

it("says when nobody rated and hides the raters list", async () => {
  serveDetail({});
  renderWithProviders(`/cocktails/${cocktailId}`);
  expect(await screen.findByText("No ratings yet")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Raters" })).toBeNull();
});

it("rolls a rating back and says so when saving fails", async () => {
  serveDetail({});
  server.use(http.put(`${detailUrl}/rating`, () => failure("INTERNAL", 500, "Disk full")));
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  await user.click(await screen.findByRole("radio", { name: "3 stars" }));
  expect(await screen.findByText("Could not save your rating")).toBeInTheDocument();
  expect(screen.getByText("Disk full")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("radio", { name: "3 stars" })).not.toBeChecked());
});

it("adds and removes a favourite from the recipe", async () => {
  const seen = serveDetail({});
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  await user.click(await screen.findByRole("button", { name: "Add to favourites" }));
  await user.click(await screen.findByRole("button", { name: "Remove from favourites" }));
  expect(await screen.findByRole("button", { name: "Add to favourites" })).toBeInTheDocument();
  expect(seen.favourites).toEqual(["put", "delete"]);
});

it("rolls a favourite back when saving fails", async () => {
  serveDetail({});
  server.use(http.put(`${detailUrl}/favourite`, () => failure("INTERNAL", 500, "Nope")));
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  await user.click(await screen.findByRole("button", { name: "Add to favourites" }));
  expect(await screen.findByText("Could not update your favourites")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add to favourites" })).toBeInTheDocument();
});

const comment = (n: number, extra: Partial<Comment> = {}): Comment => ({
  ...timestamps,
  id: id(100 + n),
  cocktail_id: cocktailId,
  body: `Comment ${n}`,
  is_private: false,
  author: ann,
  edited: false,
  ...extra,
});

/** A comment thread the handlers keep up to date; newest first, two pages. */
function serveComments(start: Comment[]): {
  posts: unknown[];
  patches: unknown[];
  deleted: string[];
} {
  let items: Comment[] = start;
  const seen = { posts: [] as unknown[], patches: [] as unknown[], deleted: [] as string[] };
  const comments = `${detailUrl}/comments`;
  server.use(
    http.get(detailUrl, () => HttpResponse.json(detail())),
    http.get(comments, ({ request }) =>
      new URL(request.url).searchParams.has("cursor")
        ? page(items.slice(2))
        : page(items.slice(0, 2), items.length > 2 ? "more" : null),
    ),
    http.post(comments, async ({ request }) => {
      const json = (await request.json()) as { body: string; is_private: boolean };
      seen.posts.push(json);
      const created: Comment = comment(50, { ...json, author: owner });
      items = [created, ...items];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${comments}/:commentId`, async ({ request, params }) => {
      const json = (await request.json()) as Partial<Comment>;
      seen.patches.push(json);
      items = items.map(
        (c: Comment): Comment => (c.id === params.commentId ? { ...c, ...json, edited: true } : c),
      );
      return HttpResponse.json(items.find((c: Comment): boolean => c.id === params.commentId));
    }),
    http.delete(`${comments}/:commentId`, ({ params }) => {
      seen.deleted.push(String(params.commentId));
      items = items.filter((c: Comment): boolean => c.id !== params.commentId);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return seen;
}

it("posts a public and a private comment, newest first", async () => {
  const seen = serveComments([comment(1)]);
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  const thread: HTMLElement = await screen.findByRole("list", { name: "Comments" });
  const post: HTMLElement = screen.getByRole("button", { name: "Post" });
  expect(post).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "Write a comment" }), "   ");
  expect(post).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "Write a comment" }), "Lovely");
  expect(post).toBeEnabled();
  await user.click(post);
  await waitFor(() =>
    expect(within(thread).getAllByRole("listitem")[0]).toHaveTextContent("Lovely"),
  );
  expect(screen.getByRole("textbox", { name: "Write a comment" })).toHaveValue("");

  await user.type(screen.getByRole("textbox", { name: "Write a comment" }), "Secret");
  const composer: HTMLElement = screen.getByRole("group", { name: "Comment visibility" });
  await user.click(within(composer).getByRole("radio", { name: "Only me" }));
  expect(within(composer).getByRole("radio", { name: "Only me" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() =>
    expect(within(thread).getAllByRole("listitem")[0]).toHaveTextContent("Secret"),
  );
  expect(within(thread).getAllByRole("listitem")[0]).toHaveTextContent("Only you");
  expect(seen.posts).toEqual([
    { body: "Lovely", is_private: false },
    { body: "Secret", is_private: true },
  ]);
});

it("shows edit and delete only on your own comments, and the private label only on yours", async () => {
  serveComments([
    comment(1, { author: owner, is_private: true, edited: true }),
    comment(2, { author: ann }),
  ]);
  renderWithProviders(`/cocktails/${cocktailId}`);
  const thread: HTMLElement = await screen.findByRole("list", { name: "Comments" });
  const [mine, theirs] = within(thread).getAllByRole("listitem") as [HTMLElement, HTMLElement];
  expect(within(mine).getByText("Only you")).toBeInTheDocument();
  expect(within(mine).getByText("(edited)")).toBeInTheDocument();
  expect(within(mine).getByRole("button", { name: "Edit" })).toBeInTheDocument();
  expect(within(mine).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  expect(within(theirs).queryByRole("button")).toBeNull();
  expect(within(theirs).queryByText("Only you")).toBeNull();
  expect(within(theirs).getByText("Ann")).toBeInTheDocument();
});

it("edits the text and visibility of your comment, or cancels", async () => {
  const seen = serveComments([comment(1, { author: owner, is_private: true })]);
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  const thread: HTMLElement = await screen.findByRole("list", { name: "Comments" });
  await user.click(within(thread).getByRole("button", { name: "Edit" }));
  await user.click(within(thread).getByRole("button", { name: "Cancel" }));
  expect(within(thread).getByText("Comment 1")).toBeInTheDocument();

  await user.click(within(thread).getByRole("button", { name: "Edit" }));
  const box: HTMLElement = within(thread).getByRole("textbox", { name: "Edit comment" });
  expect(box).toHaveValue("Comment 1");
  await user.clear(box);
  await user.type(box, "Better");
  await user.click(within(thread).getByRole("radio", { name: "Public" }));
  await user.click(within(thread).getByRole("button", { name: "Save" }));
  expect(await within(thread).findByText("Better")).toBeInTheDocument();
  expect(within(thread).getByText("(edited)")).toBeInTheDocument();
  expect(within(thread).queryByText("Only you")).toBeNull();
  expect(seen.patches).toEqual([{ body: "Better", is_private: false }]);
});

it("keeps the other loaded pages intact when posting, editing and deleting", async () => {
  serveComments([comment(1), comment(2), comment(3, { author: owner })]);
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  const thread: HTMLElement = await screen.findByRole("list", { name: "Comments" });
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await within(thread).findByText("Comment 3");

  await user.type(screen.getByRole("textbox", { name: "Write a comment" }), "Fresh");
  await user.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() =>
    expect(within(thread).getAllByRole("listitem")[0]).toHaveTextContent("Fresh"),
  );
  expect(within(thread).getByText("Comment 3")).toBeInTheDocument();

  const third = (): HTMLElement =>
    within(thread)
      .getByText(/Comment 3|Third/)
      .closest("li") as HTMLElement;
  await user.click(within(third()).getByRole("button", { name: "Edit" }));
  const box: HTMLElement = within(thread).getByRole("textbox", { name: "Edit comment" });
  await user.clear(box);
  await user.type(box, "Third");
  await user.click(within(thread).getByRole("button", { name: "Save" }));
  expect(await within(thread).findByText("Third")).toBeInTheDocument();
  expect(within(thread).getByText("Fresh")).toBeInTheDocument();

  await user.click(within(third()).getByRole("button", { name: "Delete" }));
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(within(thread).queryByText("Third")).toBeNull());
  expect(within(thread).getByText("Comment 1")).toBeInTheDocument();
});

it("keeps what you wrote and shows the error when posting fails", async () => {
  serveComments([]);
  server.use(http.post(`${detailUrl}/comments`, () => failure("INTERNAL", 500, "Try later")));
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  expect(await screen.findByText("No comments yet")).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Write a comment" }), "Hi");
  await user.click(screen.getByRole("button", { name: "Post" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try later");
  expect(screen.getByRole("textbox", { name: "Write a comment" })).toHaveValue("Hi");
});

it("deletes your comment after confirming, and loads more", async () => {
  const seen = serveComments([
    comment(1, { author: owner }),
    comment(2),
    comment(3, { body: "Oldest" }),
  ]);
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  const thread: HTMLElement = await screen.findByRole("list", { name: "Comments" });
  expect(within(thread).queryByText("Oldest")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await within(thread).findByText("Oldest")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

  await user.click(within(thread).getByRole("button", { name: "Delete" }));
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(within(thread).queryByText("Comment 1")).toBeNull());
  expect(seen.deleted).toEqual([comment(1).id]);
});

it("reports a comment list that fails to load", async () => {
  serveComments([]);
  server.use(http.get(`${detailUrl}/comments`, () => failure("INTERNAL", 500, "Broken")));
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  expect(await screen.findByText("Broken")).toBeInTheDocument();
  server.use(http.get(`${detailUrl}/comments`, () => page([comment(1)])));
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Comment 1")).toBeInTheDocument();
});

const listed = (n: number, extra: Partial<Cocktail> = {}): Cocktail =>
  ({
    ...detail({ id: id(n), name: `Drink ${n}` }),
    ...extra,
  }) as unknown as Cocktail;

it("shows ratings on cards and lets you favourite from them", async () => {
  const requests: URLSearchParams[] = [];
  let items: Cocktail[] = [
    listed(1, {
      my_rating: { score: 4, updated_at: timestamps.updated_at },
      avg_rating: 4.2,
      rating_count: 7,
    }),
    listed(2, { avg_rating: 3, rating_count: 1 }),
    listed(3),
  ];
  const favourited: string[] = [];
  server.use(
    http.get(`${base}/cocktails`, ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return page(items);
    }),
    http.put(`${base}/cocktails/:id/favourite`, ({ params }) => {
      favourited.push(`put ${params.id}`);
      items = items.map(
        (c: Cocktail): Cocktail => (c.id === params.id ? { ...c, is_favourite: true } : c),
      );
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${base}/cocktails/:id/favourite`, ({ params }) => {
      favourited.push(`delete ${params.id}`);
      items = items.map(
        (c: Cocktail): Cocktail => (c.id === params.id ? { ...c, is_favourite: false } : c),
      );
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/cocktails");
  expect(await screen.findByText("★ 4 · avg 4.2")).toBeInTheDocument();
  expect(screen.getByText("avg 3.0")).toBeInTheDocument();
  expect(screen.getAllByText(/avg/)).toHaveLength(2);

  const [first] = screen.getAllByRole("button", { name: "Add to favourites" }) as [HTMLElement];
  await user.click(first);
  await user.click(await screen.findByRole("button", { name: "Remove from favourites" }));
  await waitFor(() => expect(favourited).toHaveLength(2));
  expect(favourited[0]).toBe(`put ${id(1)}`);
  expect(favourited[1]).toBe(`delete ${id(1)}`);

  await user.click(screen.getByRole("button", { name: "List view" }));
  expect(screen.getByText("★ 4 · avg 4.2")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Add to favourites" })).toHaveLength(3);
});

it("sorts by rating and filters favourites through the URL", async () => {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`${base}/cocktails`, ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return page([listed(1)]);
    }),
  );
  const { user } = renderWithProviders("/cocktails?sort=bogus&favourite=false");
  await screen.findByRole("list", { name: "Cocktails" });
  await user.click(screen.getByRole("button", { name: "Sort" }));
  expect(screen.getByRole("radio", { name: "By name" })).toBeChecked();
  await user.keyboard("{Escape}");
  expect(requests[0]?.has("sort")).toBe(false);
  expect(requests[0]?.has("favourite")).toBe(false);

  await user.click(screen.getByRole("button", { name: "Sort" }));
  await user.click(screen.getByRole("radio", { name: "Top rated" }));
  await waitFor(() => expect(requests.at(-1)?.get("sort")).toBe("rating"));
  await user.click(screen.getByRole("checkbox", { name: "Favourites" }));
  await waitFor(() => expect(requests.at(-1)?.get("favourite")).toBe("true"));
  expect(screen.getByRole("checkbox", { name: "Favourites" })).toBeChecked();

  await user.click(screen.getByRole("checkbox", { name: "Favourites" }));
  await user.click(screen.getByRole("button", { name: "Sort" }));
  await user.click(screen.getByRole("radio", { name: "By name" }));
  await waitFor(() => expect(requests.at(-1)?.has("favourite")).toBe(false));
  expect(requests.at(-1)?.has("sort")).toBe(false);
});

it("refreshes a favourites-only list after a heart tap, and a sort is not a filter", async () => {
  let items: Cocktail[] = [listed(1, { is_favourite: true })];
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`${base}/cocktails`, ({ request }) => {
      const params: URLSearchParams = new URL(request.url).searchParams;
      requests.push(params);
      return page(params.get("favourite") === "true" ? items.filter((c) => c.is_favourite) : []);
    }),
    http.delete(`${base}/cocktails/:id/favourite`, () => {
      items = items.map((c: Cocktail): Cocktail => ({ ...c, is_favourite: false }));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/cocktails?favourite=true");
  await user.click(await screen.findByRole("button", { name: "Remove from favourites" }));
  expect(await screen.findByText("No cocktails match")).toBeInTheDocument();

  await user.click(screen.getByRole("checkbox", { name: "Favourites" }));
  await user.click(screen.getByRole("button", { name: "Sort" }));
  await user.click(screen.getByRole("radio", { name: "Top rated" }));
  await waitFor(() => expect(requests.at(-1)?.get("sort")).toBe("rating"));
  expect(await screen.findByText("No cocktails yet")).toBeInTheDocument();
});

it("says when loading more comments fails and retries", async () => {
  serveComments([comment(1), comment(2), comment(3, { body: "Oldest" })]);
  server.use(
    http.get(`${detailUrl}/comments`, ({ request }) =>
      new URL(request.url).searchParams.has("cursor")
        ? failure("INTERNAL", 500, "Offline")
        : page([comment(1), comment(2)], "more"),
    ),
  );
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  await screen.findByRole("list", { name: "Comments" });
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  server.use(
    http.get(`${detailUrl}/comments`, ({ request }) =>
      new URL(request.url).searchParams.has("cursor")
        ? page([comment(3, { body: "Oldest" })])
        : page([comment(1), comment(2)], "more"),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Retry loading more" }));
  expect(await screen.findByText("Oldest")).toBeInTheDocument();
});

it("shows a comment posted while the thread could not load", async () => {
  serveComments([]);
  server.use(http.get(`${detailUrl}/comments`, () => failure("INTERNAL", 500, "Broken")));
  const { user } = renderWithProviders(`/cocktails/${cocktailId}`);
  expect(await screen.findByText("Broken")).toBeInTheDocument();
  server.use(
    http.get(`${detailUrl}/comments`, () => page([comment(1, { body: "Fresh", author: owner })])),
  );
  await user.type(screen.getByRole("textbox", { name: "Write a comment" }), "Fresh");
  await user.click(screen.getByRole("button", { name: "Post" }));
  expect(await screen.findByText("Fresh", { selector: "p" })).toBeInTheDocument();
});
