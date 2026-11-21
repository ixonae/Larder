import type { BottleComment, Product, User } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, it } from "vitest";
import { failure, fixtureId, page, timestamps } from "@/test/fixtures.ts";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

const id = (n: number): string => fixtureId(n, "cc");
const url = `/api/bars/${BAR_ID}/products/${id(10)}`;
const ME: User = meFixture.user;
const BOB = { id: id(999), display_name: "Bob" };

const gin = (): Product => ({
  id: id(10),
  name: "Hendrick's",
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
  is_favourite: false,
  comment_count: thread.length,
  ...timestamps,
});

let seq = 100;
const comment = (
  body: string,
  author: { id: string; display_name: string } = ME,
  extra: Partial<BottleComment> = {},
): BottleComment => ({
  id: id(++seq),
  product_id: id(10),
  body,
  is_private: false,
  author: { id: author.id, display_name: author.display_name },
  created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  edited: false,
  ...extra,
});

let thread: BottleComment[] = [];
let bodies: unknown[] = [];

beforeEach(() => {
  thread = [];
  bodies = [];
  server.use(
    http.get(url, () => HttpResponse.json(gin())),
    http.get(`${url}/purchases`, () => HttpResponse.json({ items: [] })),
    http.get(`${url}/comments`, ({ request }) => {
      const visibility = new URL(request.url).searchParams.get("visibility");
      return page(thread.filter((c) => !visibility || c.is_private === (visibility === "private")));
    }),
    http.post(`${url}/comments`, async ({ request }) => {
      const body = (await request.json()) as Pick<BottleComment, "body" | "is_private">;
      bodies.push(body);
      const created = comment(body.body, ME, { ...body, created_at: new Date().toISOString() });
      thread = [created, ...thread];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${url}/comments/:commentId`, async ({ request, params }) => {
      const body = (await request.json()) as { body: string };
      bodies.push(body);
      thread = thread.map((c) => (c.id === params.commentId ? { ...c, ...body, edited: true } : c));
      return HttpResponse.json(thread.find((c) => c.id === params.commentId));
    }),
    http.delete(`${url}/comments/:commentId`, ({ params }) => {
      thread = thread.filter((c) => c.id !== params.commentId);
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const section = async (): Promise<HTMLElement> =>
  screen.findByRole("tabpanel", { name: /^Comments/ });

it("lists the thread with authors and times, and posts a comment", async () => {
  thread = [comment("Lovely with cucumber", BOB)];
  const { user } = renderWithProviders(`/bottles/${id(10)}?tab=comments`);
  const comments = await section();
  expect(screen.getByRole("tab", { name: "Comments 1" })).toHaveAttribute("aria-selected", "true");
  const item = await within(comments).findByRole("listitem");
  expect(item).toHaveTextContent("Bob");
  expect(item).toHaveTextContent("5 minutes ago");
  expect(within(item).queryByRole("button", { name: "Edit comment" })).toBeNull();
  const box = within(comments).getByRole("textbox", { name: "Write a comment" });
  expect(within(comments).getByRole("button", { name: "Post" })).toBeDisabled();
  await user.type(box, "  Try it neat  ");
  await user.click(within(comments).getByRole("button", { name: "Post" }));
  expect(await within(comments).findByText("Try it neat")).toBeInTheDocument();
  expect(bodies).toEqual([{ body: "Try it neat", is_private: false }]);
  expect(box).toHaveValue("");
  expect(await screen.findByRole("tab", { name: "Comments 2" })).toBeInTheDocument();
});

it("edits and deletes my own comment", async () => {
  thread = [comment("Grassy")];
  const { user } = renderWithProviders(`/bottles/${id(10)}?tab=comments`);
  const comments = await section();
  await user.click(await within(comments).findByRole("button", { name: "Edit comment" }));
  const edit = within(comments).getByRole("textbox", { name: "Edit comment" });
  await user.click(within(comments).getByRole("button", { name: "Cancel" }));
  expect(within(comments).queryByRole("textbox", { name: "Edit comment" })).toBeNull();
  expect(edit).not.toBeInTheDocument();
  await user.click(within(comments).getByRole("button", { name: "Edit comment" }));
  const box = within(comments).getByRole("textbox", { name: "Edit comment" });
  await user.clear(box);
  await user.type(box, "Very grassy");
  await user.click(within(comments).getByRole("button", { name: "Save" }));
  expect(await within(comments).findByText("Very grassy")).toBeInTheDocument();
  expect(within(comments).getByText("(edited)")).toBeInTheDocument();

  await user.click(within(comments).getByRole("button", { name: "Delete comment" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete this comment?" });
  await user.click(within(confirm).getByRole("button", { name: "Delete" }));
  expect(await within(comments).findByText("No comments yet")).toBeInTheDocument();
});

it("posts a private comment, filters the thread and makes the comment public", async () => {
  thread = [comment("Shared with the bar", BOB)];
  const { user } = renderWithProviders(`/bottles/${id(10)}?tab=comments`);
  const comments = within(await section());
  const filter = within(comments.getByRole("group", { name: "Filter by visibility" }));
  const composer = within(comments.getByRole("group", { name: "Comment visibility" }));
  await user.click(filter.getByRole("radio", { name: "Private" }));
  expect(await comments.findByText("No comments match")).toBeInTheDocument();
  await user.type(comments.getByRole("textbox", { name: "Write a comment" }), "Just for me");
  await user.click(composer.getByRole("radio", { name: "Only me" }));
  await user.click(comments.getByRole("button", { name: "Post" }));
  expect(await comments.findByText("Only you")).toBeInTheDocument();
  expect(composer.getByRole("radio", { name: "Public" })).toBeChecked();

  await user.click(filter.getByRole("radio", { name: "Public" }));
  expect(await comments.findByText("Shared with the bar")).toBeInTheDocument();
  expect(comments.queryByText("Just for me")).toBeNull();
  await user.click(filter.getByRole("radio", { name: "Private" }));
  const item = within(await comments.findByRole("listitem"));
  await user.click(item.getByRole("button", { name: "Edit comment" }));
  expect(item.getByRole("radio", { name: "Only me" })).toBeChecked();
  await user.click(item.getByRole("radio", { name: "Public" }));
  await user.click(item.getByRole("button", { name: "Save" }));
  expect(await comments.findByText("No comments match")).toBeInTheDocument();
  await user.click(filter.getByRole("radio", { name: "Public" }));
  expect(await comments.findByText("Just for me")).toBeInTheDocument();
  expect(bodies).toEqual([
    { body: "Just for me", is_private: true },
    { body: "Just for me", is_private: false },
  ]);
});

it("keeps the text and shows the error when posting fails", async () => {
  server.use(
    http.post(`${url}/comments`, () => failure("INTERNAL", 500, "Offline"), { once: true }),
  );
  const { user } = renderWithProviders(`/bottles/${id(10)}?tab=comments`);
  const comments = await section();
  const box = within(comments).getByRole("textbox", { name: "Write a comment" });
  await user.type(box, "Hello");
  await user.click(within(comments).getByRole("button", { name: "Post" }));
  expect(await within(comments).findByRole("alert")).toHaveTextContent("Offline");
  expect(box).toHaveValue("Hello");
});

it("lets viewers read without writing", async () => {
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({ ...meFixture, bars: [{ ...meFixture.bars[0], role: "viewer" }] }),
    ),
  );
  thread = [comment("Mine from before")];
  renderWithProviders(`/bottles/${id(10)}?tab=comments`);
  const comments = await section();
  expect(await within(comments).findByText("Mine from before")).toBeInTheDocument();
  expect(within(comments).queryByRole("textbox")).toBeNull();
  expect(within(comments).queryByRole("button", { name: "Edit comment" })).toBeNull();
});

it("retries a failed load and loads older pages", async () => {
  server.use(
    http.get(`${url}/comments`, () => failure("INTERNAL", 500, "Offline"), { once: true }),
    http.get(`${url}/comments`, ({ request }) =>
      new URL(request.url).searchParams.get("cursor")
        ? page([comment("Older", BOB)])
        : page([comment("Newer", BOB)], "next"),
    ),
  );
  const { user } = renderWithProviders(`/bottles/${id(10)}?tab=comments`);
  const comments = await section();
  await user.click(await within(comments).findByRole("button", { name: "Try again" }));
  await user.click(await within(comments).findByRole("button", { name: "Load more" }));
  await waitFor(() => expect(within(comments).getByText("Older")).toBeInTheDocument());
});
