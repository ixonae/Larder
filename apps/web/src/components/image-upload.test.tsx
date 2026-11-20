import { buildTree, type Category, type Product } from "@larder/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { failure, fixtureId, page, timestamps } from "@/test/fixtures.ts";
import { BAR_ID, server } from "@/test/msw.ts";
import { choose, renderWithProviders } from "@/test/render.tsx";

const url = `/api/bars/${BAR_ID}/products`;
const IMAGE = "01a1f326-d941-7d74-8a40-000000000900";
const gin: Category = {
  id: "01a1f326-d941-7d74-8a40-000000000001",
  name: "Gin",
  parent_id: null,
  kind: "spirit",
  default_abv: 40,
  description: null,
  image_id: IMAGE,
  ...timestamps,
};
const bottle = (id: number, name: string, image_id: string | null): Product => ({
  id: fixtureId(id),
  name,
  category_id: gin.id,
  category_name: "Gin",
  producer: null,
  country: null,
  region: null,
  abv: null,
  vintage: null,
  age_years: null,
  description: null,
  image_id,
  status: "tasted",
  stock: { open_count: 0, total_count: 0, last_bought_on: null, last_finished_on: null },
  ...timestamps,
});

let store: Product[] = [];
let requests: { method: string; path: string; type?: string }[] = [];
const photo = () => new File(["png"], "lime.png", { type: "image/png" });

beforeEach(() => {
  store = [bottle(10, "Hendrick's", IMAGE), bottle(11, "Tanqueray", null)];
  requests = [];
  server.use(
    http.get(`/api/bars/${BAR_ID}/categories/tree`, () =>
      HttpResponse.json({ items: buildTree([gin]) }),
    ),
    http.get(url, () => page(store)),
    http.get(`${url}/:id`, ({ params }) =>
      HttpResponse.json(store.find((p) => p.id === params.id)),
    ),
    http.post(url, async ({ request }) => {
      const created = { ...bottle(12, "", null), ...((await request.json()) as object) };
      store.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${url}/:id`, ({ params }) =>
      HttpResponse.json(store.find((p) => p.id === params.id)),
    ),
    http.put(`${url}/:id/image`, ({ request, params }) => {
      // jsdom's multipart bodies cannot be parsed back here; the content type shows a form was sent.
      const type = request.headers.get("content-type") ?? "";
      requests.push({ method: "PUT", path: params.id as string, type: type.split(";")[0] });
      return HttpResponse.json({ id: IMAGE });
    }),
    http.delete(`${url}/:id/image`, ({ params }) => {
      requests.push({ method: "DELETE", path: params.id as string });
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

async function openSheet(button: string) {
  const view = renderWithProviders("/bottles");
  await screen.findByRole("list", { name: "Bottles" });
  if (button === "Add bottle") await view.user.click(screen.getByRole("button", { name: button }));
  else {
    await view.user.click(screen.getByRole("link", { name: button }));
    await view.user.click(await screen.findByRole("button", { name: "Edit bottle" }));
  }
  return { ...view, sheet: await screen.findByRole("dialog") };
}

describe("pictures in lists and pages", () => {
  it("shows thumbnails, a placeholder without a picture, and the full picture on the detail page", async () => {
    const { user } = renderWithProviders("/bottles");
    const list = await screen.findByRole("list", { name: "Bottles" });
    const thumbs = list.querySelectorAll("img");
    expect([...thumbs].map((img) => img.getAttribute("src"))).toEqual([
      `/api/images/${IMAGE}/thumb`,
    ]);
    await user.click(screen.getByRole("link", { name: "Hendrick's" }));
    expect(await screen.findByRole("img", { name: "Hendrick's" })).toHaveAttribute(
      "src",
      `/api/images/${IMAGE}`,
    );
  });
});

describe("ImageUpload", () => {
  it("previews a picked photo and uploads it once a new bottle is created", async () => {
    const { user, sheet } = await openSheet("Add bottle");
    expect(within(sheet).getByText("None")).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Name"), "Sipsmith");
    await choose(user, "Category", "Gin");
    await user.upload(within(sheet).getByLabelText("Picture"), photo());
    expect(within(sheet).getByRole("img", { name: "Preview" }).getAttribute("src")).toMatch(
      /^blob:/,
    );
    expect(within(sheet).getByRole("button", { name: "Replace" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Bottle added")).toBeInTheDocument();
    expect(requests).toEqual([{ method: "PUT", path: store[2]?.id, type: "multipart/form-data" }]);
  });

  it("forgets a picked photo on Remove when the bottle had none, and ignores a cancelled pick", async () => {
    const { user, sheet } = await openSheet("Tanqueray");
    const input = within(sheet).getByLabelText("Picture") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(within(sheet).getByText("None")).toBeInTheDocument();
    await user.upload(input, photo());
    await user.click(within(sheet).getByRole("button", { name: "Remove" }));
    expect(within(sheet).getByText("None")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Bottle saved")).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it("removes the saved picture when the bottle is saved", async () => {
    const { user, sheet } = await openSheet("Hendrick's");
    expect(within(sheet).getByRole("img", { name: "Preview" })).toHaveAttribute(
      "src",
      `/api/images/${IMAGE}`,
    );
    await user.click(within(sheet).getByRole("button", { name: "Remove" }));
    expect(within(sheet).getByRole("button", { name: "Add picture" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Bottle saved")).toBeInTheDocument();
    expect(requests).toEqual([{ method: "DELETE", path: store[0]?.id }]);
  });

  it("opens the file picker from the button", async () => {
    const { user, sheet } = await openSheet("Add bottle");
    const input = within(sheet).getByLabelText("Picture") as HTMLInputElement;
    let opened = false;
    input.addEventListener("click", (e) => {
      opened = true;
      e.preventDefault();
    });
    await user.click(within(sheet).getByRole("button", { name: "Add picture" }));
    expect(opened).toBe(true);
  });

  it("keeps the bottle saved and says so when the upload fails", async () => {
    server.use(
      http.put(`${url}/:id/image`, () => failure("VALIDATION", 400, "Could not read this picture")),
    );
    const { user, sheet } = await openSheet("Tanqueray");
    await user.upload(within(sheet).getByLabelText("Picture"), photo());
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save the picture")).toBeInTheDocument();
    expect(screen.getByText("Could not read this picture")).toBeInTheDocument();
    expect(screen.queryByText("Bottle saved")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
