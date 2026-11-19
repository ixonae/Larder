import { buildTree, type Category, type CategoryKind, hasInStock } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

const url = `/api/bars/${BAR_ID}/categories`;
const treeUrl = `${url}/tree`;
let seq = 0;
const cat = (name: string, kind: CategoryKind, parent: Category | null = null, extra = {}) => ({
  id: `01a1f326-d941-7d74-8a40-${String(++seq).padStart(12, "0")}`,
  name,
  parent_id: parent?.id ?? null,
  kind,
  default_abv: kind === "spirit" ? 40 : null,
  description: null,
  image_id: null,
  always_available: false,
  in_stock: hasInStock(kind) ? false : null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...extra,
});

let store: Category[] = [];
let requests: { method: string; id?: string; body?: unknown }[] = [];

/** A small fake of the categories API, enough to check what the page sends and shows. */
function useFakeApi() {
  server.use(
    http.get(treeUrl, () => {
      const sorted = [...store].sort((a, b) => a.name.localeCompare(b.name));
      return HttpResponse.json({ items: buildTree(sorted) });
    }),
    http.post(url, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      requests.push({ method: "POST", body });
      const parent = store.find((c) => c.id === body.parent_id) ?? null;
      const created = {
        ...cat(body.name as string, (body.kind ?? parent?.kind) as CategoryKind, parent),
        ...body,
      };
      store.push(created as Category);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${url}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      requests.push({ method: "PATCH", id: params.id as string, body });
      store = store.map((c) => (c.id === params.id ? ({ ...c, ...body } as Category) : c));
      return HttpResponse.json(store.find((c) => c.id === params.id));
    }),
    http.delete(`${url}/:id`, ({ params }) => {
      requests.push({ method: "DELETE", id: params.id as string });
      const children = store.filter((c) => c.parent_id === params.id);
      if (children.length > 0) {
        return HttpResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "Still has sub-categories",
              details: {
                used_by: children.map((c) => ({ type: "category", id: c.id, name: c.name })),
              },
            },
          },
          { status: 409 },
        );
      }
      store = store.filter((c) => c.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const byName = (name: string) => store.find((c) => c.name === name) as Category;

beforeEach(() => {
  const spirit = cat("Spirit", "spirit");
  const rum = cat("Rum", "spirit", spirit);
  const juice = cat("Juice", "juice");
  store = [
    spirit,
    cat("Gin", "spirit", spirit),
    rum,
    cat("White rum", "spirit", rum),
    juice,
    cat("Lime juice", "juice", juice),
  ];
  requests = [];
  useFakeApi();
});

async function openPage() {
  const view = renderWithProviders("/categories");
  await screen.findByRole("navigation", { name: "Category tree" });
  return view;
}

const tree = () => screen.getByRole("navigation", { name: "Category tree" });
/** Names of the rows shown, in order, read from each row's "Edit …" button. */
const visibleNames = () =>
  within(tree())
    .getAllByRole("button", { name: /^Edit / })
    .map((button) => button.getAttribute("aria-label")?.replace(/^Edit /, ""));

describe("CategoriesPage", () => {
  it("shows the tree collapsed and expands or collapses a branch", async () => {
    const { user } = await openPage();
    expect(visibleNames()).toEqual(["Juice", "Spirit"]);
    expect(within(tree()).getByText("Spirit · 40%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Spirit" }));
    await user.click(screen.getByRole("button", { name: "Expand Rum" }));
    expect(visibleNames()).toEqual(["Juice", "Spirit", "Gin", "Rum", "White rum"]);
    expect(screen.getByRole("button", { name: "Collapse Spirit" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Collapse Spirit" }));
    expect(visibleNames()).toEqual(["Juice", "Spirit"]);
  });

  it("hides the add, edit and delete actions from a viewer", async () => {
    const bars = meFixture.bars.map((b) => ({ ...b, role: "viewer" as const }));
    server.use(http.get("/api/me", () => HttpResponse.json({ ...meFixture, bars })));
    await openPage();
    expect(within(tree()).getByText("Spirit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Spirit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add category" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^(Add under|Edit|Delete) / }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    store = [];
    renderWithProviders("/categories");
    expect(await screen.findByText("No categories yet")).toBeInTheDocument();
  });

  it("shows a load error and retries", async () => {
    server.use(
      http.get(
        treeUrl,
        () => HttpResponse.json({ error: { code: "INTERNAL", message: "Boom" } }, { status: 500 }),
        {
          once: true,
        },
      ),
    );
    const { user } = renderWithProviders("/categories");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Boom");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("navigation", { name: "Category tree" })).toBeInTheDocument();
  });

  it("shows loading while the bar is unknown, and a message without a bar", async () => {
    server.use(http.get("/api/me", () => delay("infinite"), { once: true }));
    const first = renderWithProviders("/categories");
    expect(await screen.findByRole("status")).toHaveTextContent("Loading…");
    first.unmount();

    server.use(http.get("/api/me", () => HttpResponse.json({ ...meFixture, bars: [] })));
    renderWithProviders("/categories");
    expect(await screen.findByText("You are not a member of any bar yet.")).toBeInTheDocument();
  });

  it("creates a top-level category", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Add category" }));
    const sheet = screen.getByRole("dialog", { name: "New category" });
    await user.type(within(sheet).getByLabelText("Name"), "Pantry");
    await user.click(within(sheet).getByRole("button", { name: "Create" }));
    expect(
      await within(sheet).findByText("Pick a kind for a top-level category"),
    ).toBeInTheDocument();
    expect(requests).toEqual([]);

    await user.selectOptions(within(sheet).getByLabelText("Kind"), "Other");
    await user.type(within(sheet).getByLabelText("Default ABV (%)"), "0");
    await user.type(within(sheet).getByLabelText("Description"), "Staples");
    await user.click(within(sheet).getByLabelText(/Always available/));
    await user.click(within(sheet).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests).toEqual([
      {
        method: "POST",
        body: {
          name: "Pantry",
          parent_id: null,
          kind: "other",
          default_abv: 0,
          description: "Staples",
          always_available: true,
        },
      },
    ]);
    expect(screen.getByText("Category created")).toBeInTheDocument();
    await waitFor(() => expect(visibleNames()).toEqual(["Juice", "Pantry", "Spirit"]));
  });

  it("adds a sub-category that inherits its kind and offers in-stock for fresh kinds", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Add under Juice" }));
    const sheet = screen.getByRole("dialog", { name: "New category" });
    expect(within(sheet).getByLabelText("Parent")).toHaveValue(byName("Juice").id);
    expect(within(sheet).getByLabelText("Kind")).toHaveDisplayValue("Same as parent (Juice)");
    await user.type(within(sheet).getByLabelText("Name"), "Yuzu juice");
    await user.click(within(sheet).getByLabelText("In stock now"));
    await user.click(within(sheet).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toEqual({
      name: "Yuzu juice",
      parent_id: byName("Juice").id,
      default_abv: null,
      description: null,
      always_available: false,
      in_stock: true,
    });
    // The parent was expanded to show the new child.
    expect(await within(tree()).findByText("Yuzu juice")).toBeInTheDocument();
  });

  it("does not send in_stock for kinds without it", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Add under Spirit" }));
    const sheet = screen.getByRole("dialog", { name: "New category" });
    expect(within(sheet).queryByLabelText("In stock now")).not.toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Name"), "Vodka");
    await user.click(within(sheet).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).not.toHaveProperty("in_stock");
  });

  it("edits a category, without offering itself or its children as parent", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Edit Spirit" }));
    const sheet = screen.getByRole("dialog", { name: "Edit Spirit" });
    const options = within(within(sheet).getByLabelText("Parent")).getAllByRole("option");
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      "None (top level)",
      "Juice",
      "Lime juice",
    ]);
    expect(within(sheet).getByLabelText("Kind")).toHaveValue("spirit");
    expect(within(sheet).getByLabelText("Default ABV (%)")).toHaveValue(40);

    await user.clear(within(sheet).getByLabelText("Name"));
    await user.type(within(sheet).getByLabelText("Name"), "Spirits");
    await user.clear(within(sheet).getByLabelText("Default ABV (%)"));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      method: "PATCH",
      id: byName("Spirits").id,
      body: { name: "Spirits", kind: "spirit", default_abv: null, parent_id: null },
    });
    expect(await screen.findByText("Category saved")).toBeInTheDocument();
  });

  it("keeps in_stock when editing a fresh ingredient", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Expand Juice" }));
    await user.click(screen.getByRole("button", { name: "Edit Lime juice" }));
    const sheet = screen.getByRole("dialog", { name: "Edit Lime juice" });
    await user.click(within(sheet).getByLabelText("In stock now"));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toMatchObject({ in_stock: true });
  });

  it.each([
    [
      "a duplicate name on the name field",
      409,
      {
        code: "CONFLICT",
        message: 'A category named "Gin" already exists at this level',
        details: [
          { path: ["name"], message: 'A category named "Gin" already exists at this level' },
        ],
      },
      'A category named "Gin" already exists at this level',
    ],
    [
      "validation issues on their fields",
      400,
      {
        code: "VALIDATION",
        message: "Invalid json",
        details: [{ path: ["name"], message: "Too long" }],
      },
      "Too long",
    ],
  ])("shows %s", async (_, status, error, text) => {
    server.use(http.post(url, () => HttpResponse.json({ error }, { status })));
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Add under Spirit" }));
    const sheet = screen.getByRole("dialog", { name: "New category" });
    await user.type(within(sheet).getByLabelText("Name"), "Gin");
    await user.click(within(sheet).getByRole("button", { name: "Create" }));
    expect(await within(sheet).findByText(text)).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows other save errors in a toast", async () => {
    server.use(
      http.patch(`${url}/:id`, () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "Disk full" } }, { status: 500 }),
      ),
    );
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Edit Juice" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save the category")).toBeInTheDocument();
    expect(screen.getByText("Disk full")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit Juice" })).toBeInTheDocument();
  });

  it("closes the sheet without saving", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes a category after confirmation", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Expand Spirit" }));
    await user.click(screen.getByRole("button", { name: "Delete Gin" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete Gin?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests).toEqual([{ method: "DELETE", id: expect.any(String) }]);
    expect(screen.getByText("Deleted Gin")).toBeInTheDocument();
    await waitFor(() => expect(within(tree()).queryByText("Gin")).not.toBeInTheDocument());
  });

  it("explains why a category in use cannot be deleted", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("button", { name: "Delete Spirit" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete Spirit?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await within(dialog).findByRole("alert");
    expect(
      within(alert)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Gin (Category)", "Rum (Category)"]);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(store).toHaveLength(6);
  });
});
